import * as fs from 'fs';
import * as path from 'path';

/**
 * Name of the bundled markdown-org-extract binary depending on the platform.
 * Win32 ships an `.exe`; other platforms ship the bare name with the
 * executable bit set in the archive.
 */
export function bundledBinaryName(platform: NodeJS.Platform): string {
    return platform === 'win32' ? 'markdown-org-extract.exe' : 'markdown-org-extract';
}

/**
 * Locate the bundled markdown-org-extract binary inside the installed
 * extension directory. Returns the absolute path if the file exists and is
 * executable, otherwise `undefined`. Pure: side-effect-free filesystem
 * probe, no VS Code or workspace dependencies, so unit tests can point it
 * at any directory layout.
 */
export function findBundledBinary(extensionPath: string, platform: NodeJS.Platform): string | undefined {
    const candidate = path.join(extensionPath, 'bin', bundledBinaryName(platform));
    try {
        fs.accessSync(candidate, fs.constants.X_OK);
    } catch {
        return undefined;
    }
    return candidate;
}
