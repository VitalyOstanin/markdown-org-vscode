import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hide everything in the VS Code chrome that is irrelevant to the recorded
 * action: primary side bar (Explorer), secondary side bar, bottom panel
 * (Terminal/Problems/Output), and activity bar. The status bar at the bottom
 * is kept -- it carries the agenda's tag-filter indicator and reads as
 * "this is VS Code", not as clutter.
 *
 * Side-bar visibility is toggled via commands (workbench provides explicit
 * close-* commands for both bars). The activity bar has no close command,
 * so it is hidden via a workspace-scoped settings update; the demo workspaces
 * are ephemeral, so the settings.json that VS Code writes there does not
 * leak into the repository.
 */
export async function hideSidePanels(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closePanel');
    const workbench = vscode.workspace.getConfiguration('workbench');
    await workbench.update('activityBar.location', 'hidden', vscode.ConfigurationTarget.Workspace);
}

/**
 * Turn on VS Code's built-in screencast overlay -- the one that surfaces
 * pressed keys at the bottom of the editor and draws a click ring on the
 * pointer. With it on, a recorded GIF reads as "what command was invoked",
 * not just "the cursor moved".
 *
 * Settings tweaks:
 *   - `screencastMode.fontSize`: bumped above the default 56px equivalent so
 *     the overlay stays legible at the 1280x720 Xvfb the recorder uses.
 *   - `screencastMode.keyboardOptions.showSingleEditorCursorMoves`: off, so
 *     plain arrow-key cursor moves do not flood the overlay during
 *     navigation-heavy scenarios.
 *   - `screencastMode.verticalOffset`: pushed up so the overlay sits inside
 *     the editor viewport regardless of the bottom-panel state.
 *
 * Settings are written at Global scope; the test instance runs against a
 * disposable `--user-data-dir` (see `.vscode-test.demo.mjs`), so this does
 * not leak into the developer's real VS Code profile.
 */
/**
 * Force the extension to emit English weekday short names (Mon/Tue/...) for
 * every CREATED/SCHEDULED/DEADLINE/CLOCK timestamp the demo plants. Demo
 * footage is shared with a global audience -- the GIFs are easier to read
 * when the dates do not switch language mid-shot.
 *
 * Workspace-scoped so the demo workspaces (which are disposable) carry the
 * setting; the developer's main VS Code profile is unaffected.
 */
export async function forceEnglishWeekdays(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('markdown-org');
    await cfg.update('weekdayLocale', 'en', vscode.ConfigurationTarget.Workspace);
}

export async function enableScreencast(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('screencastMode');
    await cfg.update('fontSize', 28, vscode.ConfigurationTarget.Global);
    await cfg.update('verticalOffset', 30, vscode.ConfigurationTarget.Global);
    await cfg.update(
        'keyboardOptions',
        {
            showKeys: true,
            showKeybindings: true,
            showCommands: true,
            showCommandGroups: false,
            showSingleEditorCursorMoves: false
        },
        vscode.ConfigurationTarget.Global
    );
    await cfg.update('keyboardOverlayTimeout', 2500, vscode.ConfigurationTarget.Global);
    // Mute the "A git repository was found in the parent folders..." notification
    // toast that otherwise grabs keyboard focus and swallows the first chord
    // xdotool sends. The demo workspaces all sit inside a checkout, so the
    // toast triggers every time without this knob.
    const git = vscode.workspace.getConfiguration('git');
    await git.update('openRepositoryInParentFolders', 'never', vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.toggleScreencastMode');
}

/**
 * Write a JSON marker file with the wall-clock time at which the demo's
 * recordable action sequence begins. The recording script (`scripts/record-demo.js`)
 * reads this marker after the test exits and trims the leading portion of the
 * MP4 that captured Xvfb + VS Code startup.
 *
 * The marker path is passed via the MARKDOWN_ORG_DEMO_MARKER environment
 * variable. If unset (e.g. when the test is run outside the recording
 * pipeline), the call is a no-op so the same suite can be executed for
 * debugging without crashing.
 */
export async function markDemoStart(): Promise<void> {
    const target = process.env.MARKDOWN_ORG_DEMO_MARKER;
    if (!target) return;
    await fs.writeFile(target, JSON.stringify({ startedAt: Date.now() }), 'utf-8');
}

/**
 * Stretch the Extension Development Host window to fill the X server's
 * screen. Useful before `captureScreenshot()`: without a window manager,
 * Xvfb opens VS Code in a much smaller default size, so screenshots come
 * out with a wide black border around the actual application chrome.
 *
 * `width`/`height` default to MARKDOWN_ORG_SCREENSHOT_GEOMETRY so the
 * helper resizes to whatever resolution the recording driver uses.
 */
export async function maximizeVscodeWindow(): Promise<void> {
    const geometry = process.env.MARKDOWN_ORG_SCREENSHOT_GEOMETRY ?? '1280x720';
    const [w, h] = geometry.split('x').map((n) => parseInt(n, 10));
    const display = process.env.DISPLAY ?? ':99';
    const search = await new Promise<{ status: number; stdout: string }>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn('xdotool', ['search', '--name', 'Extension Development Host'], {
            env: { ...process.env, DISPLAY: display },
            stdio: ['ignore', 'pipe', 'ignore']
        });
        proc.stdout.on('data', (b) => chunks.push(b));
        proc.on('exit', (code) =>
            resolve({ status: code ?? 1, stdout: Buffer.concat(chunks).toString('utf-8').trim() })
        );
        proc.on('error', reject);
    });
    if (search.status !== 0 || !search.stdout) {
        throw new Error('xdotool: could not find a VS Code Extension Development Host window');
    }
    const ids = search.stdout.split('\n').filter(Boolean);
    const wid = ids[ids.length - 1];
    const runSync = (args: string[]): Promise<number> =>
        new Promise((resolve, reject) => {
            const proc = spawn('xdotool', args, {
                env: { ...process.env, DISPLAY: display },
                stdio: ['ignore', 'inherit', 'inherit']
            });
            proc.on('exit', (code) => resolve(code ?? 1));
            proc.on('error', reject);
        });
    // `--sync` makes xdotool block until the X server reports the operation
    // applied. Without it the next demo step can race the resize -- the
    // recording then captures VS Code in its default Xvfb size with a wide
    // black border around the chrome.
    if ((await runSync(['windowsize', '--sync', wid, String(w), String(h)])) !== 0) {
        throw new Error('xdotool windowsize failed');
    }
    if ((await runSync(['windowmove', '--sync', wid, '0', '0'])) !== 0) {
        throw new Error('xdotool windowmove failed');
    }
}

/**
 * Switch the running VS Code window to the built-in Monokai theme. Used by
 * the screenshots scenario so the PNGs that land on the Open VSX listing
 * have a recognisable, high-contrast colour palette that does not look like
 * a stock VS Code screenshot. Written at Global scope; the demo runner gets
 * its own disposable user-data-dir, so the developer's own theme choice is
 * not touched.
 */
export async function applyMonokaiTheme(): Promise<void> {
    const workbench = vscode.workspace.getConfiguration('workbench');
    // If the previous run already wrote Monokai to settings, `update` is a
    // no-op and onDidChangeActiveColorTheme would never fire. Detect that
    // case up front so the caller is not blocked on a timeout.
    if (workbench.get<string>('colorTheme') === 'Monokai') {
        await sleep(500);
        return;
    }
    // Wait for VS Code to acknowledge the swap, otherwise the recording can
    // start before the editor finishes recolouring -- the first few GIF
    // frames then show the default dark theme bleeding through.
    const themeApplied = new Promise<void>((resolve) => {
        const subscription = vscode.window.onDidChangeActiveColorTheme(() => {
            subscription.dispose();
            resolve();
        });
        // Safety net: if the event for some reason does not fire (the theme
        // was already active but the workspace config did not reflect it),
        // resolve after 5 s so the demo does not stall indefinitely.
        setTimeout(() => {
            subscription.dispose();
            resolve();
        }, 5000);
    });
    // Workspace target applies immediately without a window reload; Global
    // also works but is only picked up after VS Code re-reads the settings
    // file, which is unreliable under the test runner.
    await workbench.update('colorTheme', 'Monokai', vscode.ConfigurationTarget.Workspace);
    await themeApplied;
    // Even after the active-theme event, the editor needs a moment to
    // recompute tokenisation colours and the minimap palette.
    await sleep(800);
}

/**
 * Capture a single PNG of the current X11 display via `ffmpeg -frames:v 1`.
 * Active only when the recording driver sets MARKDOWN_ORG_SCREENSHOT_DIR;
 * a no-op outside the pipeline so the same test suite can be debugged via
 * `npm run test:integration` without a screen capture stack attached.
 *
 * The frame is saved as `${MARKDOWN_ORG_SCREENSHOT_DIR}/${name}.png`. Display
 * geometry defaults to 1280x720 to match the Xvfb the recording driver starts;
 * it is read from MARKDOWN_ORG_SCREENSHOT_GEOMETRY when present so the test
 * stays portable if the driver ever changes resolution.
 */
export async function captureScreenshot(name: string): Promise<void> {
    const dir = process.env.MARKDOWN_ORG_SCREENSHOT_DIR;
    if (!dir) return;
    await fs.mkdir(dir, { recursive: true });
    const display = process.env.DISPLAY ?? ':99';
    const geometry = process.env.MARKDOWN_ORG_SCREENSHOT_GEOMETRY ?? '1280x720';
    const target = path.join(dir, `${name}.png`);
    await new Promise<void>((resolve, reject) => {
        const proc = spawn(
            'ffmpeg',
            [
                '-loglevel',
                'error',
                '-y',
                '-f',
                'x11grab',
                '-video_size',
                geometry,
                '-i',
                display,
                '-frames:v',
                '1',
                target
            ],
            { stdio: ['ignore', 'inherit', 'inherit'] }
        );
        proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg screenshot ${name} exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}

export async function moveCursorTo(editor: vscode.TextEditor, line: number, column = 0): Promise<void> {
    const position = new vscode.Position(line, column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
}

/**
 * Dispatch a keystroke (or a chord, i.e. space-separated sequence of
 * keystrokes) to the X server backing the demo recording. Goes through
 * `xdotool key` so VS Code's keyboard pipeline -- and therefore the
 * screencast overlay -- sees the input, which it does not when commands are
 * invoked through `vscode.commands.executeCommand` directly.
 *
 * Format follows xdotool's grammar: modifiers joined with `+` (`ctrl+k`,
 * `shift+Up`), multiple keystrokes separated by spaces (`ctrl+k ctrl+t`).
 * DISPLAY is read from the env so the call lands on the Xvfb that
 * record-demo.js started, not on the developer's main session.
 *
 * The first call also locates and activates the VS Code window. Without
 * that step xdotool would dispatch the keystroke into whichever window is
 * "active" on the empty Xvfb (usually nothing), and VS Code would never see
 * the chord that the demo just pressed.
 */
let vscodeWindowId: string | null = null;

async function runXdotool(args: string[]): Promise<{ status: number; stdout: string }> {
    const display = process.env.DISPLAY ?? ':99';
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn('xdotool', args, {
            env: { ...process.env, DISPLAY: display },
            stdio: ['ignore', 'pipe', 'ignore']
        });
        proc.stdout.on('data', (b) => chunks.push(b));
        proc.on('exit', (code) =>
            resolve({ status: code ?? 1, stdout: Buffer.concat(chunks).toString('utf-8').trim() })
        );
        proc.on('error', reject);
    });
}

async function ensureVscodeWindowFocused(): Promise<void> {
    // Resolve the VS Code window on every call. Caching the id is fragile:
    // VS Code can spawn helper windows (notification overlays, command
    // palette dropdowns) that steal focus and outlive the cached id.
    const { status, stdout } = await runXdotool(['search', '--name', 'Extension Development Host']);
    if (status !== 0 || !stdout) {
        throw new Error('xdotool: could not find a VS Code Extension Development Host window');
    }
    const ids = stdout.split('\n').filter(Boolean);
    vscodeWindowId = ids[ids.length - 1];
    await runXdotool(['windowactivate', '--sync', vscodeWindowId]);
    // Force pointer-follows-keyboard semantics by raising the window too.
    await runXdotool(['windowraise', vscodeWindowId]);
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decompose a `modifier+modifier+key` token into its modifier keysyms and the
 * final key. Recognizes `ctrl`, `shift`, `alt`, `meta` (case-insensitive).
 */
function splitToken(token: string): { modifiers: string[]; key: string } {
    const parts = token.split('+');
    const key = parts.pop()!;
    const modifierMap: Record<string, string> = {
        ctrl: 'ctrl',
        control: 'ctrl',
        shift: 'shift',
        alt: 'alt',
        meta: 'super'
    };
    const modifiers = parts.map((p) => modifierMap[p.toLowerCase()] ?? p);
    return { modifiers, key };
}

/**
 * Invoke a command that has no dedicated keybinding by running it through
 * the Command Palette. The whole flow -- palette opening shortcut, typed
 * command name, and the final Enter -- is dispatched at the X-server level,
 * so the screencast overlay shows the keystrokes the same way a user would
 * see them when reproducing the demo by hand.
 *
 * `name` should match the palette query a user would type, e.g.
 * "Markdown Org Show Agenda Day".
 */
export async function runCommandViaPalette(name: string): Promise<void> {
    await ensureVscodeWindowFocused();
    // Clear any stale chord/modifier state from a previous pressKey.
    for (const mod of ['ctrl', 'shift', 'alt', 'super']) {
        await runXdotool(['keyup', mod]);
    }
    await runXdotool(['key', 'Escape']);
    await pause(120);
    // Open palette: ctrl+shift+p (single modifier-combined key, no chord).
    await runXdotool(['keydown', 'ctrl']);
    await runXdotool(['keydown', 'shift']);
    await runXdotool(['key', 'p']);
    await runXdotool(['keyup', 'shift']);
    await runXdotool(['keyup', 'ctrl']);
    await pause(350);
    await runXdotool(['type', '--delay', '25', name]);
    await pause(450);
    await runXdotool(['key', 'Return']);
}

export async function pressKey(sequence: string): Promise<void> {
    await ensureVscodeWindowFocused();
    // Defensively clear any modifiers that an earlier xdotool call might have
    // left stuck (an interrupted run, a race on `keyup`, or a chord that
    // returned before its keyup finished propagating). Without this guard,
    // VS Code's chord recognizer sees stale `ctrl-down` on the next chord
    // step and either ignores it or routes it as a continuation of a stale
    // multi-chord state.
    for (const mod of ['ctrl', 'shift', 'alt', 'super']) {
        await runXdotool(['keyup', mod]);
    }
    // Drop any pending chord state in VS Code. The chord recognizer
    // remembers the partial chord prefix across the chord timeout, and
    // Escape is the documented "abort chord" key on every VS Code edition.
    // Skip the reset when the caller is itself sending Escape, to avoid an
    // infinite loop.
    if (sequence.trim() !== 'Escape') {
        await runXdotool(['key', 'Escape']);
        await pause(60);
    }
    const tokens = sequence.split(/\s+/).filter(Boolean);
    // Send each chord step with explicit keydown/keyup on modifiers and a
    // real JS pause between steps. VS Code's chord recognizer needs to see
    // each step as a distinct top-level keyboard event; sending them as a
    // single `xdotool key A B C` call or even back-to-back `xdotool key`
    // invocations causes the second prefix to fail randomly on Xvfb after
    // the first chord has already entered multi-chord mode.
    for (let i = 0; i < tokens.length; i++) {
        const { modifiers, key } = splitToken(tokens[i]);
        for (const mod of modifiers) {
            const r = await runXdotool(['keydown', mod]);
            if (r.status !== 0) throw new Error(`xdotool keydown ${mod} failed`);
        }
        const tap = await runXdotool(['key', key]);
        if (tap.status !== 0) throw new Error(`xdotool key ${key} failed`);
        for (const mod of [...modifiers].reverse()) {
            const r = await runXdotool(['keyup', mod]);
            if (r.status !== 0) throw new Error(`xdotool keyup ${mod} failed`);
        }
        if (i < tokens.length - 1) {
            await pause(200);
        }
    }
}
