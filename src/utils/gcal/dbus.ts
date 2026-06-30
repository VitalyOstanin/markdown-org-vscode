import { exec } from '../exec';

/** Run a subprocess and resolve with its stdout/stderr and exit/error code.
 *  `code` is the numeric exit code, or a string error code like 'ENOENT' when
 *  the binary is missing. Injected in tests. */
export type DbusRun = (
    file: string,
    args: string[]
) => Promise<{ stdout: string; stderr: string; code: number | string }>;

const MAX_BUFFER_BYTES = 1024 * 1024;
const GOA_DEST = 'org.gnome.OnlineAccounts';

/** Thrown by `busctlCall` when the `busctl` binary is absent, so callers can
 *  fall back to gdbus without matching on an error message. */
export class BusctlMissingError extends Error {
    constructor(message = 'busctl not found') {
        super(message);
        this.name = 'BusctlMissingError';
    }
}

export const defaultDbusRun: DbusRun = (file, args) =>
    new Promise((resolve) => {
        exec.execFile(file, args, { encoding: 'utf-8', maxBuffer: MAX_BUFFER_BYTES }, (error, stdout, stderr) => {
            const e = error as (NodeJS.ErrnoException & { code?: number | string }) | null;
            const code: number | string = e ? (e.code ?? 1) : 0;
            resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
        });
    });

export interface DbusCallSpec {
    objectPath: string;
    iface: string;
    method: string;
}

/** Call a GOA DBus method via `busctl --user --json=short`, returning the parsed
 *  `.data` array. Throws `BusctlMissingError` when busctl is absent so callers
 *  can fall back to gdbus. Never logs the output (may carry a token). */
export async function busctlCall(run: DbusRun, spec: DbusCallSpec): Promise<unknown[]> {
    const args = ['--user', '--json=short', 'call', GOA_DEST, spec.objectPath, spec.iface, spec.method];
    const { stdout, stderr, code } = await run('busctl', args);
    if (code === 'ENOENT') {
        throw new BusctlMissingError();
    }
    if (code !== 0) {
        throw new Error(`busctl ${spec.method} failed: ${stderr.trim() || `exit ${code}`}`);
    }
    let parsed: { data?: unknown };
    try {
        parsed = JSON.parse(stdout) as { data?: unknown };
    } catch {
        throw new Error(`busctl ${spec.method}: unexpected output`);
    }
    if (!parsed || !Array.isArray(parsed.data)) {
        throw new Error(`busctl ${spec.method}: unexpected output`);
    }
    return parsed.data;
}

/** Fallback for the scalar GetAccessToken (s,i) via `gdbus call`. GVariant text
 *  tuple `('<token>', <expires_in>)`; Google access tokens contain no quotes or
 *  backslashes, so a single regex is safe. */
export async function gdbusGetAccessToken(run: DbusRun, objectPath: string): Promise<[string, number]> {
    const args = [
        'call',
        '--session',
        '--dest',
        GOA_DEST,
        '--object-path',
        objectPath,
        '--method',
        'org.gnome.OnlineAccounts.OAuth2Based.GetAccessToken'
    ];
    const { stdout, stderr, code } = await run('gdbus', args);
    if (code !== 0) {
        throw new Error(`gdbus GetAccessToken failed: ${stderr.trim() || `exit ${code}`}`);
    }
    const m = /^\('([^']*)',\s*(\d+)\)/.exec(stdout.trim());
    if (!m) {
        throw new Error('gdbus GetAccessToken: unexpected output');
    }
    return [m[1], Number(m[2])];
}
