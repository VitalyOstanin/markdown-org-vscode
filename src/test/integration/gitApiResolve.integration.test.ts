import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { suite, test, setup } from 'mocha';
import { forgetResolvedRepositories, resolveRepositoryFor } from '../../utils/git/gitApi';
import type { GitApi, GitRepository } from '../../utils/git/gitApiTypes';

/**
 * The resolution chain against a stand-in Git API.
 *
 * Two properties that only show up over time and are therefore invisible to the
 * tests that run against a real repository: a failure must not become the
 * answer for the rest of the session, and a repository that was closed and
 * reopened must be primed again -- both are about what the module remembers
 * between passes, so each test starts by forgetting everything.
 */
suite('git repository resolution', () => {
    setup(() => {
        forgetResolvedRepositories();
    });

    /** A repository whose forced status passes are counted. */
    function fakeRepository(root: string): GitRepository & { statusCalls: number } {
        const repository = {
            rootUri: { fsPath: root },
            state: {
                workingTreeChanges: [],
                indexChanges: [],
                onDidChange: () => ({ dispose: () => undefined })
            },
            statusCalls: 0,
            status: () => {
                repository.statusCalls += 1;
                return Promise.resolve();
            },
            add: () => Promise.resolve(),
            commit: () => Promise.resolve(),
            push: () => Promise.resolve(),
            diffBetween: () => Promise.resolve([]),
            log: () => Promise.resolve([])
        };
        return repository;
    }

    /** An API that only knows repositories it was told to open. */
    function fakeApi(root: string, rootAnswer: () => Promise<{ fsPath: string } | null>) {
        const repository = fakeRepository(root);
        let opened = false;
        let rootCalls = 0;
        const api: GitApi = {
            repositories: [],
            // `getRepository` answers only for a repository VS Code has opened,
            // which here means one this chain opened itself.
            getRepository: () => (opened ? repository : null),
            getRepositoryRoot: async () => {
                rootCalls += 1;
                return rootAnswer();
            },
            openRepository: () => {
                opened = true;
                return Promise.resolve(repository);
            },
            onDidOpenRepository: () => ({ dispose: () => undefined }),
            onDidCloseRepository: () => ({ dispose: () => undefined })
        };
        return {
            api,
            repository,
            close: () => {
                opened = false;
            },
            get rootCalls() {
                return rootCalls;
            }
        };
    }

    test('a failure to ask git is not remembered as "outside git"', async () => {
        // The failure this covers is transient by nature -- an unsafe-ownership
        // refusal the user then fixes with `safe.directory`. Remembering it
        // would leave the panel reporting "outside git" until the window is
        // reloaded, with only a log line to explain it.
        const root = path.join(path.sep, 'tmp', 'notes-repo');
        let asked = 0;
        const fake = fakeApi(root, () => {
            asked += 1;
            return asked === 1
                ? Promise.reject(new Error('detected dubious ownership'))
                : Promise.resolve({ fsPath: root });
        });
        const file = path.join(root, 'home.md');

        const first = await resolveRepositoryFor(fake.api, file, new Map());
        assert.equal(first, undefined, 'a failure degrades to "no repository" for this pass');

        const second = await resolveRepositoryFor(fake.api, file, new Map());
        assert.equal(second?.repository.rootUri.fsPath, root, 'the next pass asks git again');
        assert.equal(asked, 2);
    });

    test('a repository that was closed is primed again when it comes back', async () => {
        // A repository opened by this chain arrives with empty change groups,
        // so the first status pass is forced. Closing it (Git: Close
        // Repository, or a workspace folder change) puts it back into that
        // state, and the panel would otherwise report a dirty tree as clean.
        const root = path.join(path.sep, 'tmp', 'reopened-repo');
        const fake = fakeApi(root, () => Promise.resolve({ fsPath: root }));
        const file = path.join(root, 'home.md');

        await resolveRepositoryFor(fake.api, file, new Map());
        assert.equal(fake.repository.statusCalls, 1, 'the first resolution forces one status pass');

        // What the panel does on `onDidCloseRepository`.
        fake.close();
        forgetResolvedRepositories();

        await resolveRepositoryFor(fake.api, file, new Map());
        assert.equal(fake.repository.statusCalls, 2, 'the reopened repository is primed again');
    });
});
