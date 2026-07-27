import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suite, test, suiteSetup, suiteTeardown } from 'mocha';
import { collectGitStatus } from '../../utils/git/collectGitStatus';
import { commitAgendaSources } from '../../commands/gitActions';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import { AgendaPanel } from '../../views/agendaPanel';
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
 * Git identity is passed per command with `-c`. The global config is never
 * touched -- a test that rewrites `user.email` would re-author every commit the
 * developer makes afterwards in any repository without a local identity.
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
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-org-git-'));
        repoDir = path.join(workDir, 'real-repo');
        linkDir = path.join(workDir, 'linked-notes');
        fs.mkdirSync(repoDir);

        // Inside repoDir, not workDir: the temporary root also holds the bare
        // remote, the symlink and the loose file another test needs to be
        // outside any repository.
        git(['init', '--initial-branch=master']);
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

        fs.symlinkSync(repoDir, linkDir, 'dir');
    });

    suiteTeardown(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    test('resolves a symlinked source file into the repository behind it', async function () {
        this.timeout(30000);
        const status = await collectGitStatus([linked('work.md')]);
        assert.ok(status, 'expected a status: the built-in git extension should be available');
        assert.strictEqual(status.repos.length, 1, 'the file must resolve to exactly one repository');
        // The repository sits outside the workspace folders, so it was opened
        // by the resolution chain rather than found among the open ones.
        assert.strictEqual(fs.realpathSync(status.repos[0]!.root), fs.realpathSync(repoDir));
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

    test('the commit takes only the view files and leaves the rest of the tree alone', async function () {
        this.timeout(30000);
        const before = git(['status', '--porcelain']);
        assert.ok(before.includes('unrelated.md'), 'precondition: an unrelated edit is pending');

        // The message prompt is host UI; stub it rather than drive it.
        const original = vscode.window.showInputBox;
        (vscode.window as { showInputBox: unknown }).showInputBox = () => Promise.resolve('agenda: test commit');
        try {
            await commitAgendaSources([linked('work.md')], AGENDA_STRINGS.en);
            await waitUntil(
                () => !git(['status', '--porcelain']).includes(' work.md'),
                'work.md to leave the pending list'
            );
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
});

/**
 * The chip in a real panel. Separate suite because it drives the agenda command
 * against the test workspace (which lives inside this repository, so it is
 * tracked) rather than the temporary repository above.
 */
suite('agenda panel git chip', () => {
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
});
