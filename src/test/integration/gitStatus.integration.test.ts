import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import { collectGitStatus } from '../../utils/git/collectGitStatus';
import { getGitApi, resolveRepositoryFor } from '../../utils/git/gitApi';
import { pathKey } from '../../utils/git/gitPathMatch';
import {
    commitAgendaSources,
    commitAndSyncAgendaSources,
    pushAgendaSources,
    syncAgendaSources
} from '../../commands/gitActions';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import { AgendaPanel } from '../../views/agendaPanel';
import type { AgendaGitStatus } from '../../types';
import { waitForAgendaRender, waitUntil } from './_helpers';

/**
 * The git status against a real repository, which is the half the unit suite
 * cannot reach: `realpath` resolution, `getRepositoryRoot` on a path outside
 * the workspace folders, and `diffBetween` over an actual commit graph.
 *
 * The repository lives in a temporary directory and is reached through a
 * symlink, because that is the arrangement the resolution chain exists for: a
 * notes folder linked into place while the repository sits elsewhere.
 *
 * Git identity is passed per command with `-c`, and written into the test
 * repository's own config for the commits the Git extension makes. The global
 * config is never touched -- a test that rewrites `user.email` would re-author
 * every commit the developer makes afterwards in any repository without a
 * local identity.
 *
 * Where the symlink cannot be created (Windows without the developer mode
 * privilege), the suite falls back to the real path: the resolution chain is
 * then exercised on the platforms that can link, and the rest of the
 * assertions still run everywhere.
 */
const GIT_ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid'];

let repoDir: string;
let linkDir: string;
let workDir: string;

function git(args: string[], cwd = repoDir): string {
    return execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf-8' });
}

/** Absolute path of a file as the agenda would report it: through the symlink. */
function linked(name: string): string {
    return path.join(linkDir, name);
}

suite('agenda git status against a real repository', () => {
    suiteSetup(function () {
        this.timeout(30000);
        // `realpathSync.native` rather than the plain one: on Windows the temp
        // directory arrives as an 8.3 short name (`RUNNER~1`), which the Git
        // extension reports expanded -- comparing the two forms would fail on
        // paths that name the same directory.
        workDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-git-')));
        repoDir = path.join(workDir, 'real-repo');
        linkDir = path.join(workDir, 'linked-notes');
        fs.mkdirSync(repoDir);

        // Inside repoDir, not workDir: the temporary root also holds the bare
        // remote, the symlink and the loose file another test needs to be
        // outside any repository.
        git(['init', '--initial-branch=master']);
        // The commit under test is made by the Git extension, which runs plain
        // `git commit` -- it never sees the `-c` pairs above. A machine without
        // a global identity (every CI runner) would fail that commit, so the
        // identity is written into this repository's own config.
        git(['config', 'user.name', 'Test']);
        git(['config', 'user.email', 'test@example.invalid']);
        // A bare repository stands in for the remote: enough for a real
        // upstream and a real `origin/master` ref, with nothing to serve.
        const remote = path.join(workDir, 'remote.git');
        execFileSync('git', ['init', '--bare', remote], { encoding: 'utf-8' });

        fs.writeFileSync(path.join(repoDir, 'notes.md'), '# clean\n');
        fs.writeFileSync(path.join(repoDir, 'work.md'), '# work\n');
        fs.writeFileSync(path.join(repoDir, 'home.md'), '# home\n');
        fs.writeFileSync(path.join(repoDir, 'unrelated.md'), '# not an agenda source\n');
        git(['add', '.']);
        git(['commit', '-m', 'initial']);
        git(['remote', 'add', 'origin', remote]);
        git(['push', '-u', 'origin', 'master']);

        // One commit that is not on the remote -> home.md is "unpushed".
        fs.appendFileSync(path.join(repoDir, 'home.md'), 'later\n');
        git(['add', 'home.md']);
        git(['commit', '-m', 'local only']);

        // One uncommitted edit, one untracked file, and one uncommitted edit
        // to a file the agenda never shows.
        fs.appendFileSync(path.join(repoDir, 'work.md'), 'draft\n');
        fs.writeFileSync(path.join(repoDir, 'fresh.md'), '# untracked\n');
        fs.appendFileSync(path.join(repoDir, 'unrelated.md'), 'edit\n');

        try {
            fs.symlinkSync(repoDir, linkDir, 'dir');
        } catch {
            linkDir = repoDir;
        }
    });

    suiteTeardown(() => {
        // The Git extension keeps watching every repository it opened and the
        // API of version 1 has no way to close one, so on Windows the files are
        // still held here. Retry, and never fail the suite over cleanup: the
        // directory is under the OS temp root either way.
        try {
            fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch {
            /* a leftover temp directory is not a test result */
        }
    });

    test('resolves a symlinked source file into the repository behind it', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([linked('work.md')]);
        assert.ok(status, 'expected a status: the built-in git extension should be available');
        assert.strictEqual(status.repos.length, 1, 'the file must resolve to exactly one repository');
        // The repository sits outside the workspace folders, so it was opened
        // by the resolution chain rather than found among the open ones.
        assert.strictEqual(fs.realpathSync.native(status.repos[0]!.root), fs.realpathSync.native(repoDir));
        assert.strictEqual(status.uncommittedCount, 1);
        // The page still shows the path the user gave, not the resolved one.
        assert.strictEqual(status.files[0]?.file, linked('work.md'));
    });

    test('separates uncommitted, unpushed and clean files', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([
            linked('work.md'),
            linked('home.md'),
            linked('notes.md'),
            linked('fresh.md')
        ]);
        assert.ok(status);
        // work.md edited, fresh.md untracked.
        assert.strictEqual(status.uncommittedCount, 2, JSON.stringify(status.files));
        // home.md is in the one commit the remote does not have.
        assert.strictEqual(status.unpushedCount, 1, JSON.stringify(status.files));
        assert.strictEqual(status.unpushedCommits, 1);
        const clean = status.files.find((f) => f.file === linked('notes.md'));
        assert.ok(clean && !clean.uncommitted && !clean.unpushed, 'notes.md must read as clean');
    });

    // The repository sits outside the workspace folders, and VS Code watches
    // the files of a workspace folder. Nothing tells the Git extension that a
    // file changed out there, so its state stays as the last pass left it --
    // which is how the chip kept saying "clean" over a note that had just been
    // written, until the Refresh button in Source Control was pressed by hand.
    test('an edit outside the workspace reaches the chip without a manual refresh', async function () {
        this.timeout(30000);
        const clean = path.join(repoDir, 'watched.md');
        fs.writeFileSync(clean, '# watched\n');
        git(['add', 'watched.md']);
        git(['commit', '-m', 'a file to edit later']);

        const before = await collectGitStatus([linked('watched.md')]);
        assert.ok(before);
        assert.strictEqual(before.uncommittedCount, 0, 'the file starts committed');

        fs.appendFileSync(clean, 'edited on disk\n');

        const after = await collectGitStatus([linked('watched.md')]);
        assert.ok(after);
        assert.strictEqual(after.uncommittedCount, 1, JSON.stringify(after.files));
    });

    // The other half of the same rule. A repository event means the Git
    // extension has just rebuilt its state; a pass answering that event must
    // read what is there rather than ask for another read, because the read is
    // what produces the next event. Left unchecked the two fed each other one
    // `git status` per debounce for as long as the panel stayed open, and the
    // chip -- rebuilt on every one of them -- shut its own dropdown and
    // flickered under the pointer.
    test('a pass told the state is current does not read the repository again', async function () {
        this.timeout(30000);
        const api = await getGitApi();
        assert.ok(api, 'the Git extension must be available for this test');
        const resolved = await resolveRepositoryFor(api, linked('home.md'), new Map());
        assert.ok(resolved, 'the source file must resolve to a repository');

        const repository = resolved.repository as { status(): Promise<void> };
        const original = repository.status.bind(repository);
        // Counted in an array rather than a number: a counter starting at 0 is
        // narrowed to that literal by the checker, which does not follow the
        // stand-in below, and every later comparison would be a constant.
        const reads: string[] = [];
        repository.status = async () => {
            reads.push('read');
            await original();
        };
        try {
            await collectGitStatus([linked('home.md')], { refresh: false });
            assert.deepStrictEqual(reads, [], 'nothing should have been read again');

            await collectGitStatus([linked('home.md')]);
            assert.ok(reads.length > 0, 'the default pass still reads the repository');
        } finally {
            repository.status = original;
        }
    });

    // The reason this one is here rather than in the unit suite: `log` is
    // declared in our own copy of the Git API (gitApiTypes.ts), so nothing but
    // a real host proves the member exists. A missing one would be swallowed
    // by the collector's catch and leave the list quietly empty.
    test('the commits waiting to be pushed reach the model, subject and hash', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([linked('home.md')]);
        assert.ok(status);
        const repo = status.repos[0];
        assert.ok(repo, 'expected the repository in the model');
        const commits = repo.unpushedCommitList ?? [];
        // Presence, not the whole list: this repository is shared with the
        // tests after it and one of them commits into it, so an exact list
        // would depend on the order mocha happens to run them in.
        const local = commits.find((c) => c.subject === 'local only');
        assert.ok(local, `expected the unpushed commit in ${JSON.stringify(repo)}`);
        assert.match(local.hash, /^[0-9a-f]{7}$/);
    });

    test('a long backlog is cut to what the dropdown lists, and the count stays whole', async function () {
        this.timeout(30000);
        // Its own repository: the shared one is written to by the tests around
        // this, and what is asserted here is a number of commits.
        const manyDir = path.join(workDir, 'many-commits-repo');
        const manyRemote = path.join(workDir, 'many-commits-remote.git');
        fs.mkdirSync(manyDir);
        const run = (args: string[]): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd: manyDir, encoding: 'utf-8' });
        execFileSync('git', ['init', '--bare', manyRemote], { encoding: 'utf-8' });
        run(['init', '--initial-branch=master']);
        const target = path.join(manyDir, 'log.md');
        fs.writeFileSync(target, '# log\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['remote', 'add', 'origin', manyRemote]);
        run(['push', '-u', 'origin', 'master']);
        // Nine unpushed commits, one more than the dropdown lists. The last of
        // them carries a body, which is what the subject is cut from.
        for (let i = 1; i <= 9; i++) {
            fs.appendFileSync(target, `entry ${i}\n`);
            run(['add', 'log.md']);
            run(['commit', '-m', i === 9 ? 'Ninth entry\n\nWhy: the body must not reach the row.' : `entry ${i}`]);
        }

        const status = await collectGitStatus([target]);
        assert.ok(status);
        const repo = status.repos[0];
        assert.ok(repo);
        assert.strictEqual(repo.aheadCommits, 9, 'the count is the whole truth');
        assert.strictEqual(status.unpushedCommits, 9);
        const listed = repo.unpushedCommitList ?? [];
        assert.strictEqual(listed.length, 8, 'the list is cut to what the dropdown shows');
        assert.strictEqual(
            listed[0]?.subject,
            'Ninth entry',
            'the newest commit leads, and its body stays out of the row'
        );
    });

    test('an edit outside the view is never counted', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([linked('work.md')]);
        assert.ok(status);
        assert.strictEqual(status.files.length, 1);
        assert.strictEqual(status.uncommittedCount, 1);
        // unrelated.md is modified in the same repository but is not a source
        // of this view, so it must not appear anywhere in the model.
        assert.ok(!status.files.some((f) => f.file.endsWith('unrelated.md')));
    });

    test('a file outside any repository lands in the outside-git group', async function () {
        this.timeout(30000);
        const loose = path.join(workDir, 'loose.md');
        fs.writeFileSync(loose, '# loose\n');
        const status = await collectGitStatus([loose]);
        assert.ok(status);
        assert.strictEqual(status.outsideGitCount, 1);
        assert.strictEqual(status.uncommittedCount, 0);
        fs.rmSync(loose);
    });

    test('a repeated source file is collected once', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([linked('work.md'), linked('work.md'), linked('./work.md')]);
        assert.ok(status);
        assert.strictEqual(status.files.length, 1, JSON.stringify(status.files));
    });

    test('a file that no longer exists lands outside git rather than aborting the pass', async function () {
        this.timeout(30000);
        // realpath fails on it; the pass must keep going and place it in the
        // outside-git group, because the agenda payload is a snapshot and a
        // task can outlive its file.
        const status = await collectGitStatus([linked('work.md'), path.join(workDir, 'vanished.md')]);
        assert.ok(status);
        assert.strictEqual(status.files.length, 2);
        assert.strictEqual(status.outsideGitCount, 1);
        assert.strictEqual(status.uncommittedCount, 1);
    });

    test('the commit takes only the view files and leaves the rest of the tree alone', async function () {
        this.timeout(30000);
        const before = git(['status', '--porcelain']);
        assert.ok(before.includes('unrelated.md'), 'precondition: an unrelated edit is pending');

        // The message prompt is host UI; stub it rather than drive it.
        const original = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve('agenda: test commit');
        try {
            await commitAgendaSources([linked('work.md')], AGENDA_STRINGS.en, 'en');
            try {
                await waitUntil(
                    () => !git(['status', '--porcelain']).includes(' work.md'),
                    'work.md to leave the pending list'
                );
            } catch (error) {
                // The commit runs inside the Git extension, which reports its
                // own failures to the UI rather than to this process; without
                // the tree state the timeout says nothing about why.
                throw new Error(`${String(error)}\ngit status:\n${git(['status', '--porcelain'])}`, {
                    cause: error
                });
            }
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = original;
        }

        const after = git(['status', '--porcelain']);
        assert.ok(after.includes('unrelated.md'), 'the unrelated edit must survive the commit');
        assert.ok(after.includes('fresh.md'), 'an untracked file outside the commit must survive it');
        const last = git(['log', '-1', '--name-only', '--format=%s']);
        assert.ok(last.includes('agenda: test commit'), last);
        assert.ok(last.includes('work.md'), last);
        assert.ok(!last.includes('unrelated.md'), `the commit swept in an unrelated file:\n${last}`);
    });

    test('an empty commit message commits nothing', async function () {
        this.timeout(30000);
        const before = git(['rev-parse', 'HEAD']).trim();
        const original = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve('   ');
        try {
            await commitAgendaSources([linked('fresh.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = original;
        }
        assert.strictEqual(git(['rev-parse', 'HEAD']).trim(), before, 'HEAD moved on a blank message');
        assert.ok(git(['status', '--porcelain']).includes('fresh.md'), 'fresh.md must still be pending');
    });

    test('a dismissed prompt commits nothing', async function () {
        this.timeout(30000);
        const before = git(['rev-parse', 'HEAD']).trim();
        const original = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(undefined);
        try {
            await commitAgendaSources([linked('fresh.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = original;
        }
        assert.strictEqual(git(['rev-parse', 'HEAD']).trim(), before, 'HEAD moved on a dismissed prompt');
    });

    test('push sends the local commits to the upstream', async function () {
        this.timeout(30000);
        const remote = path.join(workDir, 'remote.git');
        const remoteHead = (): string =>
            execFileSync('git', ['--git-dir', remote, 'rev-parse', 'master'], { encoding: 'utf-8' }).trim();
        const local = git(['rev-parse', 'HEAD']).trim();
        assert.notStrictEqual(remoteHead(), local, 'precondition: the remote is behind');

        await pushAgendaSources([linked('home.md')], AGENDA_STRINGS.en, 'en');
        await waitUntil(() => remoteHead() === local, 'the remote to receive the local commits');
    });

    test('a branch with no upstream is not pushed without consent', async function () {
        this.timeout(30000);
        // A second repository, deliberately without a remote: its branch has no
        // upstream, which is the case that asks before creating one.
        const soloDir = path.join(workDir, 'solo-repo');
        fs.mkdirSync(soloDir);
        execFileSync('git', [...GIT_ID, 'init', '--initial-branch=master'], { cwd: soloDir, encoding: 'utf-8' });
        fs.writeFileSync(path.join(soloDir, 'solo.md'), '# solo\n');
        execFileSync('git', [...GIT_ID, 'add', '.'], { cwd: soloDir, encoding: 'utf-8' });
        execFileSync('git', [...GIT_ID, 'commit', '-m', 'initial'], { cwd: soloDir, encoding: 'utf-8' });

        let asked = 0;
        const original = vscode.window.showWarningMessage;
        // Declining the modal: the flow must leave the repository alone rather
        // than guess a remote.
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = () => {
            asked += 1;
            return Promise.resolve(undefined);
        };
        try {
            await pushAgendaSources([path.join(soloDir, 'solo.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
        }
        assert.strictEqual(asked, 1, 'the missing upstream must be asked about exactly once');
        const remotes = execFileSync('git', ['remote'], { cwd: soloDir, encoding: 'utf-8' }).trim();
        assert.strictEqual(remotes, '', 'declining must not create a remote');

        // The same repository read as status: with no upstream there is
        // nothing to diff against, so the unpushed side stays empty rather
        // than reporting every commit of the branch.
        const status = await collectGitStatus([path.join(soloDir, 'solo.md')]);
        assert.ok(status);
        assert.strictEqual(status.repos[0]?.upstream, undefined);
        assert.strictEqual(status.unpushedCount, 0);
        assert.strictEqual(status.unpushedCommits, 0);
    });

    test('accepting the prompt creates the upstream and says so', async function () {
        this.timeout(30000);
        // A repository with a remote but no upstream: the branch was never
        // pushed, so `ahead` is absent and there is nothing to count -- the
        // outcome has to be reported by name or it is not reported at all.
        const freshDir = path.join(workDir, 'fresh-upstream-repo');
        const freshRemote = path.join(workDir, 'fresh-remote.git');
        fs.mkdirSync(freshDir);
        const run = (args: string[]): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd: freshDir, encoding: 'utf-8' });
        execFileSync('git', ['init', '--bare', freshRemote], { encoding: 'utf-8' });
        run(['init', '--initial-branch=master']);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.invalid']);
        fs.writeFileSync(path.join(freshDir, 'plans.md'), '# plans\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['remote', 'add', 'origin', freshRemote]);
        assert.strictEqual(run(['branch', '--list', '--format=%(upstream)']).trim(), '', 'precondition: no upstream');

        let prompt = '';
        let reported = '';
        const originalWarning = vscode.window.showWarningMessage;
        const originalStatus = vscode.window.setStatusBarMessage;
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (
            message: string,
            _options: unknown,
            confirm: string
        ) => {
            prompt = message;
            return Promise.resolve(confirm);
        };
        (vscode.window as { setStatusBarMessage: unknown }).setStatusBarMessage = (message: string) => {
            reported = message;
            return { dispose: () => undefined };
        };
        try {
            await pushAgendaSources([path.join(freshDir, 'plans.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarning;
            (vscode.window as { setStatusBarMessage: unknown }).setStatusBarMessage = originalStatus;
        }

        assert.ok(prompt.includes('fresh-upstream-repo'), `the prompt must name the repository:\n${prompt}`);
        const local = run(['rev-parse', 'HEAD']).trim();
        await waitUntil(
            () =>
                execFileSync('git', ['--git-dir', freshRemote, 'rev-parse', 'master'], {
                    encoding: 'utf-8'
                }).trim() === local,
            'the remote to receive the new branch'
        );
        assert.strictEqual(
            run(['branch', '--list', '--format=%(upstream:short)']).trim(),
            'origin/master',
            'the push must have set the upstream, not just sent the commits'
        );
        // Silence here was the defect: the count is zero for this outcome, so a
        // message keyed off the count reported nothing at all.
        assert.ok(reported.includes('fresh-upstream-repo/master'), `unexpected status message: "${reported}"`);
    });

    // Its own repository again: a merge left unresolved in the shared one would
    // stay unresolved for every test after it.
    test('an unresolved merge stops the commit before the message is asked for', async function () {
        this.timeout(30000);
        const mergeDir = path.join(workDir, 'merge-repo');
        fs.mkdirSync(mergeDir);
        const run = (args: string[]): void => {
            execFileSync('git', [...GIT_ID, ...args], { cwd: mergeDir, encoding: 'utf-8' });
        };
        const target = path.join(mergeDir, 'plan.md');
        run(['init', '--initial-branch=master']);
        fs.writeFileSync(target, '# plan\nbase\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['checkout', '-b', 'other']);
        fs.writeFileSync(target, '# plan\nfrom the branch\n');
        run(['commit', '-am', 'branch edit']);
        run(['checkout', 'master']);
        fs.writeFileSync(target, '# plan\nfrom master\n');
        run(['commit', '-am', 'master edit']);
        try {
            run(['merge', 'other']);
            assert.fail('precondition: the merge was supposed to conflict');
        } catch {
            /* the conflict is the precondition */
        }

        const status = await collectGitStatus([target]);
        assert.ok(status);
        assert.strictEqual(status.conflictCount, 1, JSON.stringify(status.repos));
        assert.strictEqual(status.files[0]?.conflicted, true, JSON.stringify(status.files));

        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: mergeDir, encoding: 'utf-8' }).trim();
        let asked = 0;
        let reported = '';
        const originalInput = vscode.window.showInputBox;
        const originalError = vscode.window.showErrorMessage;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => {
            asked += 1;
            return Promise.resolve('agenda: should never be used');
        };
        (vscode.window as { showErrorMessage: unknown }).showErrorMessage = (message: string) => {
            reported = message;
            return Promise.resolve(undefined);
        };
        try {
            await commitAgendaSources([target], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
            (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
        }
        assert.strictEqual(asked, 0, 'a refusal must come before the message prompt, not after it');
        assert.match(reported, /unresolved conflicts/, reported);
        assert.strictEqual(
            execFileSync('git', ['rev-parse', 'HEAD'], { cwd: mergeDir, encoding: 'utf-8' }).trim(),
            head,
            'HEAD moved while a merge was unresolved'
        );
    });

    // The mobile client's `SyncError::Rejected` case: the remote moved on, the
    // push is refused, and the answer is to get those commits -- never to force.
    test('a rejected push is explained, and the remote is left as it was', async function () {
        this.timeout(30000);
        const staleRemote = path.join(workDir, 'stale-remote.git');
        const staleDir = path.join(workDir, 'stale-repo');
        const otherDir = path.join(workDir, 'stale-other');
        execFileSync('git', ['init', '--bare', staleRemote], { encoding: 'utf-8' });
        const run = (args: string[], cwd: string): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf-8' });

        fs.mkdirSync(staleDir);
        run(['init', '--initial-branch=master'], staleDir);
        fs.writeFileSync(path.join(staleDir, 'diary.md'), '# diary\n');
        run(['add', '.'], staleDir);
        run(['commit', '-m', 'initial'], staleDir);
        run(['remote', 'add', 'origin', staleRemote], staleDir);
        run(['push', '-u', 'origin', 'master'], staleDir);

        // A second clone pushes first: from now on the remote holds a commit
        // this repository does not have.
        execFileSync('git', [...GIT_ID, 'clone', staleRemote, otherDir], { encoding: 'utf-8' });
        fs.appendFileSync(path.join(otherDir, 'diary.md'), 'from elsewhere\n');
        run(['commit', '-am', 'remote side'], otherDir);
        run(['push'], otherDir);
        const remoteHead = (): string =>
            execFileSync('git', ['--git-dir', staleRemote, 'rev-parse', 'master'], { encoding: 'utf-8' }).trim();
        const before = remoteHead();

        fs.appendFileSync(path.join(staleDir, 'diary.md'), 'local work\n');
        run(['commit', '-am', 'local side'], staleDir);

        let reported = '';
        const originalError = vscode.window.showErrorMessage;
        (vscode.window as { showErrorMessage: unknown }).showErrorMessage = (message: string) => {
            reported = message;
            return Promise.resolve(undefined);
        };
        try {
            await pushAgendaSources([path.join(staleDir, 'diary.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
        }
        assert.match(reported, /Push rejected/, reported);
        assert.match(reported, /Fetch and merge/, reported);
        assert.strictEqual(remoteHead(), before, 'the refused push must leave the remote untouched');
    });

    // Its own repository: the commit under test has to actually happen for the
    // progress wrapper around it to be observed, and the shared repository is
    // read by the tests before this one.
    test('the commit and the push each run under a progress notification', async function () {
        this.timeout(30000);
        const progressRemote = path.join(workDir, 'progress-remote.git');
        const progressDir = path.join(workDir, 'progress-repo');
        execFileSync('git', ['init', '--bare', progressRemote], { encoding: 'utf-8' });
        fs.mkdirSync(progressDir);
        const run = (args: string[]): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd: progressDir, encoding: 'utf-8' });
        run(['init', '--initial-branch=master']);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.invalid']);
        const target = path.join(progressDir, 'plan.md');
        fs.writeFileSync(target, '# plan\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['remote', 'add', 'origin', progressRemote]);
        run(['push', '-u', 'origin', 'master']);
        fs.appendFileSync(target, 'one more line\n');

        const titles: string[] = [];
        const originalProgress = vscode.window.withProgress;
        const originalInput = vscode.window.showInputBox;
        // The wrapper is what is under test, so it is recorded and then run:
        // a stub that skipped the callback would report a title for work that
        // never happened.
        (vscode.window as { withProgress: unknown }).withProgress = (
            options: { title?: string; location?: unknown },
            task: (p: unknown, t: unknown) => Thenable<unknown>
        ) => {
            titles.push(`${String(options.title)} @ ${String(options.location)}`);
            return originalProgress.call(vscode.window, options as never, task as never);
        };
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve('agenda: progress');
        try {
            await commitAgendaSources([target], AGENDA_STRINGS.en, 'en');
            await waitUntil(() => !run(['status', '--porcelain']).includes('plan.md'), 'the edit to reach a commit');
            await pushAgendaSources([target], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { withProgress: unknown }).withProgress = originalProgress;
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
        }

        assert.strictEqual(titles.length, 2, `expected one progress per action, got ${JSON.stringify(titles)}`);
        // `ProgressLocation.Notification` is 15: a status-bar spinner would sit
        // behind the commit-message modal, which is the reason for the choice.
        assert.strictEqual(titles[0], `${AGENDA_STRINGS.en.git.commitProgress} @ 15`);
        assert.strictEqual(titles[1], `${AGENDA_STRINGS.en.git.pushProgress} @ 15`);
    });

    // The mobile client counts what it sent, and so does this: a branch three
    // commits ahead must not report "1 repository".
    test('the push reports the commits it sent, not the repositories it visited', async function () {
        this.timeout(30000);
        const aheadRemote = path.join(workDir, 'ahead-remote.git');
        const aheadDir = path.join(workDir, 'ahead-repo');
        execFileSync('git', ['init', '--bare', aheadRemote], { encoding: 'utf-8' });
        fs.mkdirSync(aheadDir);
        const run = (args: string[]): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd: aheadDir, encoding: 'utf-8' });
        run(['init', '--initial-branch=master']);
        const target = path.join(aheadDir, 'log.md');
        fs.writeFileSync(target, '# log\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['remote', 'add', 'origin', aheadRemote]);
        run(['push', '-u', 'origin', 'master']);
        for (const line of ['second\n', 'third\n']) {
            fs.appendFileSync(target, line);
            run(['commit', '-am', line.trim()]);
        }

        const reported: string[] = [];
        const originalStatusBar = vscode.window.setStatusBarMessage;
        (vscode.window as unknown as { setStatusBarMessage: unknown }).setStatusBarMessage = (message: string) => {
            reported.push(message);
            return { dispose: () => undefined };
        };
        try {
            // The extension only learns the branch is ahead after the Git
            // extension has read this repository, which is what opening it for
            // the status does.
            await waitUntil(async () => {
                const status = await collectGitStatus([target]);
                return status?.unpushedCommits === 2;
            }, 'the two local commits to be seen as unpushed');
            await pushAgendaSources([target], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as unknown as { setStatusBarMessage: unknown }).setStatusBarMessage = originalStatusBar;
        }

        const line = reported.find((message) => message.includes('ushed')) ?? reported.join(' | ');
        assert.match(line, /2 commits/, `expected a count in commits, got: ${line}`);
    });

    test('a detached HEAD is refused rather than offered an upstream', async function () {
        this.timeout(30000);
        // Its own repository, detached before the Git extension ever opens it:
        // a checkout inside an already-open repository would only reach the
        // extension's state after an event this test would have to wait for.
        const detachedDir = path.join(workDir, 'detached-repo');
        fs.mkdirSync(detachedDir);
        const run = (args: string[]): void => {
            execFileSync('git', [...GIT_ID, ...args], { cwd: detachedDir, encoding: 'utf-8' });
        };
        run(['init', '--initial-branch=master']);
        fs.writeFileSync(path.join(detachedDir, 'detached.md'), '# detached\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['checkout', '--detach']);

        let asked = 0;
        const original = vscode.window.showWarningMessage;
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = () => {
            asked += 1;
            return Promise.resolve(undefined);
        };
        try {
            await pushAgendaSources([path.join(detachedDir, 'detached.md')], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = original;
        }
        assert.strictEqual(asked, 0, 'a detached HEAD must not be offered an upstream');

        const status = await collectGitStatus([path.join(detachedDir, 'detached.md')]);
        assert.ok(status);
        assert.strictEqual(status.repos[0]?.branch, undefined, 'a detached HEAD has no branch name');
    });

    // A view spanning two repositories where only one has edits: `commit` on
    // the untouched one refuses an empty index, and that refusal used to end
    // the round before the repository with the actual work was reached.
    test('a repository with nothing to commit does not stop the ones after it', async function () {
        this.timeout(30000);
        const cleanDir = path.join(workDir, 'pair-clean');
        const dirtyDir = path.join(workDir, 'pair-dirty');
        const prepare = (dir: string, name: string): string => {
            fs.mkdirSync(dir);
            const run = (args: string[]): void => {
                execFileSync('git', [...GIT_ID, ...args], { cwd: dir, encoding: 'utf-8' });
            };
            run(['init', '--initial-branch=master']);
            run(['config', 'user.name', 'Test']);
            run(['config', 'user.email', 'test@example.invalid']);
            const file = path.join(dir, name);
            fs.writeFileSync(file, `# ${name}\n`);
            run(['add', '.']);
            run(['commit', '-m', 'initial']);
            return file;
        };
        const cleanFile = prepare(cleanDir, 'settled.md');
        const dirtyFile = prepare(dirtyDir, 'draft.md');
        fs.appendFileSync(dirtyFile, 'one more line\n');
        const headOf = (dir: string): string =>
            execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
        const cleanHead = headOf(cleanDir);

        // The clean repository first, so its refusal would come before the
        // other one is reached.
        const files = [cleanFile, dirtyFile];
        await waitUntil(async () => {
            const status = await collectGitStatus(files);
            return status?.uncommittedCount === 1;
        }, 'the edit in the second repository to be seen');

        const originalInput = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve('agenda: the dirty one');
        try {
            await commitAgendaSources(files, AGENDA_STRINGS.en, 'en');
            await waitUntil(
                () => execFileSync('git', ['status', '--porcelain'], { cwd: dirtyDir, encoding: 'utf-8' }) === '',
                'the edit to reach a commit despite the clean repository ahead of it'
            );
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
        }
        assert.strictEqual(headOf(cleanDir), cleanHead, 'the clean repository must not have been committed to');
    });

    // `commit()` takes no paths, so whatever is in the index travels with it.
    // The user is asked before that happens, and a dismissal commits nothing.
    test('a commit that would carry someone else’s staged file asks first', async function () {
        this.timeout(30000);
        const foreignDir = path.join(workDir, 'foreign-index');
        fs.mkdirSync(foreignDir);
        const run = (args: string[]): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd: foreignDir, encoding: 'utf-8' });
        run(['init', '--initial-branch=master']);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.invalid']);
        const source = path.join(foreignDir, 'agenda-note.md');
        const foreign = path.join(foreignDir, 'someone-else.md');
        fs.writeFileSync(source, '# note\n');
        fs.writeFileSync(foreign, '# elsewhere\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        fs.appendFileSync(source, 'agenda edit\n');
        fs.appendFileSync(foreign, 'staged by hand\n');
        run(['add', 'someone-else.md']);

        const headOf = (): string => run(['rev-parse', 'HEAD']).trim();
        const before = headOf();
        await waitUntil(async () => {
            const status = await collectGitStatus([source]);
            return status?.uncommittedCount === 1;
        }, 'the agenda file to be seen as uncommitted');

        let prompt = '';
        let asked = 0;
        const originalWarn = vscode.window.showWarningMessage;
        const originalInput = vscode.window.showInputBox;
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = (message: string) => {
            prompt = message;
            return Promise.resolve(undefined);
        };
        (vscode.window as { showInputBox: unknown }).showInputBox = () => {
            asked += 1;
            return Promise.resolve('agenda: never used');
        };
        try {
            await commitAgendaSources([source], AGENDA_STRINGS.en, 'en');
            assert.match(prompt, /staged outside this view/, prompt);
            assert.match(prompt, /foreign-index/, prompt);
            assert.strictEqual(asked, 0, 'the question must come before the message prompt, not after it');
            assert.strictEqual(headOf(), before, 'a dismissed question must commit nothing');

            // Answered this time: the commit goes ahead, carrying both files,
            // which is what the question said it would.
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = () =>
                Promise.resolve(AGENDA_STRINGS.en.git.commitForeignConfirm);
            (vscode.window as { showInputBox: unknown }).showInputBox = () =>
                Promise.resolve('agenda: with the staged file');
            await commitAgendaSources([source], AGENDA_STRINGS.en, 'en');
            await waitUntil(() => headOf() !== before, 'the confirmed commit to be made');
        } finally {
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
        }

        const last = run(['log', '-1', '--name-only', '--format=%s']);
        assert.ok(last.includes('agenda-note.md'), last);
        assert.ok(last.includes('someone-else.md'), `the confirmed commit was supposed to carry it too:\n${last}`);
    });

    // ---- sync: both directions under one press --------------------------

    /**
     * A repository, its remote, and a second clone standing in for the other
     * device -- the arrangement every sync case is a variation of.
     *
     * One per test rather than one shared: the cases differ by which side has
     * moved, and a repository carried between them would make each test's
     * precondition depend on the order they run in.
     */
    function syncFixture(name: string) {
        const remote = path.join(workDir, `${name}-remote.git`);
        const dir = path.join(workDir, `${name}-repo`);
        const other = path.join(workDir, `${name}-other`);
        const run = (args: string[], cwd = dir): string =>
            execFileSync('git', [...GIT_ID, ...args], { cwd, encoding: 'utf-8' });

        execFileSync('git', ['init', '--bare', remote], { encoding: 'utf-8' });
        fs.mkdirSync(dir);
        run(['init', '--initial-branch=master']);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.invalid']);
        fs.writeFileSync(path.join(dir, 'diary.md'), '# diary\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        run(['remote', 'add', 'origin', remote]);
        run(['push', '-u', 'origin', 'master']);

        return {
            source: path.join(dir, 'diary.md'),
            /** Run git in the repository under test. */
            run,
            /** Commit an edit here, without handing it over. */
            edit: (text: string): void => {
                fs.appendFileSync(path.join(dir, 'diary.md'), text);
                run(['commit', '-am', 'local side']);
            },
            /** The other device commits and pushes, so the remote moves. */
            elsewhere: (text: string): void => {
                if (!fs.existsSync(other)) {
                    execFileSync('git', [...GIT_ID, 'clone', remote, other], { encoding: 'utf-8' });
                    run(['config', 'user.name', 'Other'], other);
                    run(['config', 'user.email', 'other@example.invalid'], other);
                }
                fs.appendFileSync(path.join(other, 'diary.md'), text);
                run(['commit', '-am', 'the other device'], other);
                run(['push'], other);
            },
            head: (): string => run(['rev-parse', 'HEAD']).trim(),
            remoteHead: (): string =>
                execFileSync('git', ['--git-dir', remote, 'rev-parse', 'master'], { encoding: 'utf-8' }).trim()
        };
    }

    /** Run a sync and return what it put in the status bar and in a dialog. */
    async function runSync(source: string): Promise<{ said: string; reported: string }> {
        let said = '';
        let reported = '';
        const originalStatus = vscode.window.setStatusBarMessage;
        const originalError = vscode.window.showErrorMessage;
        (vscode.window as { setStatusBarMessage: unknown }).setStatusBarMessage = (message: string) => {
            said = message;
            return { dispose: () => undefined };
        };
        (vscode.window as { showErrorMessage: unknown }).showErrorMessage = (message: string) => {
            reported = message;
            return Promise.resolve(undefined);
        };
        try {
            await syncAgendaSources([source], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { setStatusBarMessage: unknown }).setStatusBarMessage = originalStatus;
            (vscode.window as { showErrorMessage: unknown }).showErrorMessage = originalError;
        }
        return { said, reported };
    }

    // The half a push button cannot do: the commit is on the remote and
    // nowhere else, and the press has to end with it in the working copy.
    test('a sync brings in what the other device left on the remote', async function () {
        this.timeout(30000);
        const repo = syncFixture('sync-behind');
        repo.elsewhere('from elsewhere\n');

        const { said, reported } = await runSync(repo.source);

        assert.strictEqual(reported, '', `nothing should have failed:\n${reported}`);
        assert.match(said, /Brought in 1 commit/, said);
        assert.strictEqual(repo.head(), repo.remoteHead(), 'the branch here must be level with the remote');
        assert.match(fs.readFileSync(repo.source, 'utf-8'), /from elsewhere/);
    });

    // The other half, and the reason this is one button rather than two: the
    // press that fetches also hands over what is owed.
    test('a sync hands over what is here and not on the remote', async function () {
        this.timeout(30000);
        const repo = syncFixture('sync-ahead');
        repo.edit('local work\n');
        const local = repo.head();

        const { said, reported } = await runSync(repo.source);

        assert.strictEqual(reported, '', `nothing should have failed:\n${reported}`);
        assert.match(said, /Pushed 1 commit/, said);
        await waitUntil(() => repo.remoteHead() === local, 'the commit to reach the remote');
    });

    // Both sides moved. The mobile client refuses this too (`SyncError::
    // Diverged`): merging is a decision with an author, and a button that made
    // it silently would be the one place these clients write history nobody
    // asked for.
    test('a sync leaves a diverged branch exactly as it was', async function () {
        this.timeout(30000);
        const repo = syncFixture('sync-diverged');
        repo.elsewhere('from elsewhere\n');
        repo.edit('local work\n');
        const local = repo.head();
        const remote = repo.remoteHead();

        const { said, reported } = await runSync(repo.source);

        assert.match(reported, /have both moved/, reported);
        assert.match(reported, /origin\/master/, reported);
        assert.strictEqual(said, '', `a run that did nothing must not report work:\n${said}`);
        assert.strictEqual(repo.head(), local, 'the branch here must be untouched');
        assert.strictEqual(repo.remoteHead(), remote, 'the remote must be untouched');
    });

    // ---- commit and sync: the two presses as one ------------------------

    /** Run the pair with the message box answering `message`. */
    async function runCommitSync(source: string, message: string | undefined): Promise<void> {
        const original = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(message);
        try {
            await commitAndSyncAgendaSources([source], AGENDA_STRINGS.en, 'en');
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = original;
        }
    }

    // The press exists because a note is written here and read on the phone,
    // which takes the commit and the push after it.
    test('commit and sync writes the commit and hands it to the remote', async function () {
        this.timeout(30000);
        const repo = syncFixture('commit-sync');
        fs.appendFileSync(repo.source, 'written here\n');

        await runCommitSync(repo.source, 'agenda: commit and sync');

        await waitUntil(() => repo.remoteHead() === repo.head(), 'the commit to reach the remote');
        assert.ok(!repo.run(['status', '--porcelain']).includes('diary.md'), 'nothing should be left pending');
        assert.ok(repo.run(['log', '-1', '--format=%s']).includes('agenda: commit and sync'));
    });

    // A dismissed message box is a "not now" about the whole press: syncing
    // around it would move the branch the user just declined to add to.
    test('a dismissed message box stops the round before the sync', async function () {
        this.timeout(30000);
        const repo = syncFixture('commit-sync-cancelled');
        repo.elsewhere('from elsewhere\n');
        fs.appendFileSync(repo.source, 'written here\n');
        const local = repo.head();

        await runCommitSync(repo.source, undefined);

        assert.strictEqual(repo.head(), local, 'the branch here must be untouched');
        assert.ok(
            !fs.readFileSync(repo.source, 'utf-8').includes('from elsewhere'),
            'the fetch must not have run either'
        );
    });

    // The counters the button was drawn from are a snapshot. Finding nothing
    // left to commit is not a refusal, and what the remote holds is the other
    // half of the press.
    test('a round with nothing to commit still syncs', async function () {
        this.timeout(30000);
        const repo = syncFixture('commit-sync-clean');
        repo.elsewhere('from elsewhere\n');

        await runCommitSync(repo.source, 'agenda: never asked');

        await waitUntil(
            () => fs.readFileSync(repo.source, 'utf-8').includes('from elsewhere'),
            'the remote commit to arrive'
        );
        assert.strictEqual(repo.head(), repo.remoteHead(), 'the branch here must be level with the remote');
    });

    // Nothing to do is an outcome, not a silence: the press has to answer, or
    // it reads as a button that does not work.
    test('a sync with nothing to move says the two sides agree', async function () {
        this.timeout(30000);
        const repo = syncFixture('sync-level');

        const { said, reported } = await runSync(repo.source);

        assert.strictEqual(reported, '', `nothing should have failed:\n${reported}`);
        assert.match(said, /Already level with the remote/, said);
    });
});

/**
 * A status of the test's own making, for the panel states that cannot be
 * produced by editing files: this repository is not going to be left
 * mid-merge to make a screenshot of the conflict group.
 */
function pendingStatus(): AgendaGitStatus {
    return {
        repos: [
            {
                root: '/tmp/panel-repo',
                name: 'panel-repo',
                branch: 'master',
                upstream: 'origin/master',
                aheadCommits: 1,
                unpushedCommitList: [{ hash: 'abc1234', subject: 'local work' }]
            }
        ],
        files: [
            {
                file: '/tmp/panel-repo/notes.md',
                label: 'notes.md',
                repoRoot: '/tmp/panel-repo',
                uncommitted: true,
                unpushed: false,
                conflicted: false
            }
        ],
        uncommittedCount: 1,
        unpushedCount: 0,
        outsideGitCount: 0,
        unpushedCommits: 1,
        conflictCount: 0
    };
}

/** The same repository, mid-merge: one path still unresolved. */
function conflictedStatus(): AgendaGitStatus {
    const base = pendingStatus();
    return {
        ...base,
        repos: [{ ...base.repos[0]!, conflictCount: 1 }],
        files: [{ ...base.files[0]!, conflicted: true }],
        conflictCount: 1
    };
}

/**
 * The chip in a real panel. Separate suite because it drives the agenda command
 * against the test workspace (which lives inside this repository, so it is
 * tracked) rather than the temporary repository above.
 */
suite('agenda panel git chip', () => {
    const panelRepos: string[] = [];

    // Released after every test, including the ones that never paused it: the
    // tests further down read the status the panel collects itself, and a pause
    // left behind by an earlier failure would leave them waiting for a chip
    // nobody is going to compute.
    teardown(() => {
        AgendaPanel.pauseGitStatusForTesting(false);
    });

    suiteTeardown(() => {
        for (const dir of panelRepos) {
            try {
                fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            } catch {
                /* a leftover temp directory is not a test result */
            }
        }
    });

    /**
     * Render an agenda whose only source file is an uncommitted note in a
     * repository of this test's own.
     *
     * Needed by the two tests that hold the host at its commit-message prompt:
     * the panel's own workspace is gitignored, so a commit started against it
     * finds nothing changed and returns before any prompt is raised. The chip
     * itself is still driven by a posted status -- what these tests read is
     * what the page does, not what this repository happens to contain.
     */
    async function renderOverPendingRepository(name: string): Promise<void> {
        const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `markdown-org-panel-${name}-`)));
        panelRepos.push(dir);
        const run = (args: string[]): void => {
            execFileSync('git', [...GIT_ID, ...args], { cwd: dir, encoding: 'utf-8' });
        };
        run(['init', '--initial-branch=master']);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.invalid']);
        const file = path.join(dir, 'note.md');
        fs.writeFileSync(file, '# note\n');
        run(['add', '.']);
        run(['commit', '-m', 'initial']);
        fs.appendFileSync(file, '- [ ] still being written\n');

        AgendaPanel.render({
            data: [{ file, line: 1, heading: 'note', content: 'note', task_type: 'TODO' }],
            mode: 'tasks'
        });
        await waitForAgendaRender('tasks');
        // Opening a repository VS Code has never seen costs a `rev-parse`, an
        // `openRepository` and a first status pass. Paid here, so the click
        // that follows measures the page rather than that first walk.
        await waitUntil(async () => {
            const status = await collectGitStatus([file]);
            return status?.uncommittedCount === 1;
        }, 'the new repository to be opened and read');
        // From here the page holds only what the test posts. The panel watches
        // every open repository, and this one is being written to, so without
        // the pause a real status lands between the stand-in and the assertion
        // and rebuilds the buttons from a repository with nothing to push.
        AgendaPanel.pauseGitStatusForTesting(true);
    }

    test('the header carries a git chip once the status reaches the page', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        // The status is computed after the render and delivered on its own
        // message, so the chip appears a beat later than the task list.
        let info = await AgendaPanel.queryRenderedInfoForTesting();
        const deadline = Date.now() + 15000;
        while ((!info || info.gitChip === '') && Date.now() < deadline) {
            info = await AgendaPanel.queryRenderedInfoForTesting();
        }
        assert.ok(info, 'no panel open');
        assert.notStrictEqual(info.gitChip, '', 'the agenda header never received a git chip');
    });

    test('the dropdown buttons reach the commit and push flows', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const handle = (AgendaPanel as unknown as { handleWebviewMessage(m: unknown): Promise<void> })
            .handleWebviewMessage;
        // Both prompts are dismissed, so the test workspace is never committed
        // by its own suite. Whether a prompt appears at all depends on the
        // workspace files being under git, which is not this test's subject:
        // what is asserted is that the messages reach the flows and return.
        const originalInput = vscode.window.showInputBox;
        const originalWarn = vscode.window.showWarningMessage;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve(undefined);
        (vscode.window as { showWarningMessage: unknown }).showWarningMessage = () => Promise.resolve(undefined);
        try {
            await handle.call(AgendaPanel, { command: 'gitCommit' });
            await handle.call(AgendaPanel, { command: 'gitPush' });
        } finally {
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
            (vscode.window as { showWarningMessage: unknown }).showWarningMessage = originalWarn;
        }
    });

    // What a press leaves on screen while the host works. The status is posted
    // rather than collected: the buttons only exist when there is something to
    // commit, and that must not depend on the state this repository happens to
    // be in while the suite runs.
    test('pressing an action takes the other buttons out of service and marks the pressed one', async function () {
        this.timeout(30000);
        await renderOverPendingRepository('busy');
        // Posted once, not in a loop: `renderOverPendingRepository` has paused
        // the panel's own collection, so this stand-in is the last word on what
        // the chip shows.
        await AgendaPanel.postGitStatusForTesting(pendingStatus());
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitActions.join(' | ') === 'sync | commit | commitSync | push';
        }, 'all three actions to be offered');

        // The commit flow is held at its message prompt, which is what makes
        // the intermediate state readable at all: released too early and the
        // fresh status would already have rebuilt the buttons.
        const prompt = Promise.withResolvers<string | undefined>();
        const originalInput = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => prompt.promise;
        try {
            await AgendaPanel.clickGitActionForTesting('commit');
            await waitUntil(async () => {
                const info = await AgendaPanel.queryRenderedInfoForTesting();
                return info?.gitActions.includes('commit (off, busy)') === true;
            }, 'the pressed button to show it is working');
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            assert.ok(info);
            assert.deepStrictEqual(
                info.gitActions,
                ['sync (off)', 'commit (off, busy)', 'commitSync (off)', 'push (off)'],
                'the other buttons must be out of service too, and without a spinner of their own'
            );
        } finally {
            prompt.resolve(undefined);
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
        }

        // Dismissing the prompt commits nothing, and the buttons come back:
        // the host answers even the cancelled case with `gitActionDone`, which
        // is the only thing that re-enables them.
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info !== null && !info.gitActions.some((action) => action.includes('off'));
        }, 'the buttons to return to service');
    });

    // The host recomputes the status per render and per repository event, and
    // most of those answers say what the chip already says. Rebuilding the node
    // for one of them threw away what the user was doing with it: the dropdown
    // they had just opened closed itself, and under a repeating status the chip
    // flickered under the pointer.
    test('a status that says what the chip already says leaves the dropdown open', async function () {
        this.timeout(30000);
        await renderOverPendingRepository('dropdown');
        await AgendaPanel.postGitStatusForTesting(pendingStatus());
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitActions.join(' | ') === 'sync | commit | commitSync | push';
        }, 'all three actions to be offered');

        await AgendaPanel.clickGitChipForTesting();
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitMenuOpen === true;
        }, 'the dropdown to open');

        // The same status again, as the host sends it after any render.
        await AgendaPanel.postGitStatusForTesting(pendingStatus());
        const afterSame = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(afterSame);
        assert.strictEqual(afterSame.gitMenuOpen, true, 'an unchanged status must not close the dropdown');

        // And a status that does change something rebuilds the chip -- but the
        // dropdown is open in the DOM, not in the status, so it is carried over
        // rather than lost with the node.
        const changed = pendingStatus();
        changed.uncommittedCount = 2;
        await AgendaPanel.postGitStatusForTesting(changed);
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitChip.includes('2') === true;
        }, 'the chip to report the new count');
        const afterChange = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(afterChange);
        assert.strictEqual(afterChange.gitMenuOpen, true, 'a rebuild must carry the open dropdown over');
    });

    // Staging is part of the commit, and it moves the repository's resource
    // groups on its own -- so a status arrives while the commit is still
    // running. Rebuilding the chip from it used to hand the buttons back
    // mid-flight, which is a second commit one click away.
    test('a status arriving mid-action leaves the buttons out of service', async function () {
        this.timeout(30000);
        await renderOverPendingRepository('mid-action');
        // Posted once, not in a loop: `renderOverPendingRepository` has paused
        // the panel's own collection, so this stand-in is the last word on what
        // the chip shows.
        await AgendaPanel.postGitStatusForTesting(pendingStatus());
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitActions.join(' | ') === 'sync | commit | commitSync | push';
        }, 'all three actions to be offered');

        const prompt = Promise.withResolvers<string | undefined>();
        const originalInput = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => prompt.promise;
        try {
            await AgendaPanel.clickGitActionForTesting('commit');
            await waitUntil(async () => {
                const info = await AgendaPanel.queryRenderedInfoForTesting();
                return info?.gitActions.includes('commit (off, busy)') === true;
            }, 'the pressed button to show it is working');

            // The status the staging would have produced. Messages are handled
            // in order, so the query that follows sees the page after it.
            await AgendaPanel.postGitStatusForTesting(pendingStatus());
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            assert.deepStrictEqual(
                info?.gitActions,
                ['sync (off)', 'commit (off, busy)', 'commitSync (off)', 'push (off)'],
                'a status is not the end of the action and must not re-enable the buttons'
            );
        } finally {
            prompt.resolve(undefined);
            (vscode.window as { showInputBox: unknown }).showInputBox = originalInput;
        }

        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info !== null && !info.gitActions.some((action) => action.includes('off'));
        }, 'the buttons to return to service once the action is over');
    });

    test('a conflicted status offers no commit button and says where to resolve it', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');
        await AgendaPanel.postGitStatusForTesting(conflictedStatus());
        await waitUntil(async () => {
            const info = await AgendaPanel.queryRenderedInfoForTesting();
            return info?.gitGroups.includes('conflicted') === true;
        }, 'the conflict group to appear');

        const info = await AgendaPanel.queryRenderedInfoForTesting();
        assert.ok(info);
        assert.strictEqual(info.gitGroups[0], 'conflicted', 'the conflict must be the first thing in the dropdown');
        assert.deepStrictEqual(
            info.gitActions,
            ['sync', 'push'],
            'a conflict must leave no way to commit from the panel'
        );
        // The count reaches the chip, so the header says something is wrong
        // without the dropdown being opened.
        assert.match(info.gitChip, /!/, info.gitChip);
    });

    test('a source row opens its file', async function () {
        this.timeout(30000);
        await vscode.commands.executeCommand('markdown-org.showAgendaDay');
        await waitForAgendaRender('day');

        const handle = (AgendaPanel as unknown as { handleWebviewMessage(m: unknown): Promise<void> })
            .handleWebviewMessage;
        const file = path.join(__dirname, '..', '..', '..', 'package.json');
        await handle.call(AgendaPanel, { command: 'openSourceFile', file });
        // Through `pathKey`, not string equality: VS Code hands back the drive
        // letter in lower case while `realpathSync.native` upper-cases it, and
        // the two spell the same file.
        const expected = pathKey(fs.realpathSync.native(file));
        await waitUntil(() => {
            const open = vscode.window.activeTextEditor?.document.uri.fsPath;
            return open !== undefined && pathKey(open) === expected;
        }, 'the source file to become the active editor');
    });
});
