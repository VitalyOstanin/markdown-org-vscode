import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from './exec';
import { notifyError, notifyWarn } from './notify';
import { findBundledBinary } from './bundledBinary';
import { extractorVersionWarning, parseExtractorVersion } from './extractorVersion';
import { logDiagnostic } from './logChannel';

export const EXTRACTOR_TIMEOUT_MS = 30_000;
export const EXTRACTOR_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
export const WHICH_TIMEOUT_MS = 5_000;
const EXTRACTOR_DEFAULT = 'markdown-org-extract';

async function lookupInPath(name: string): Promise<boolean> {
    // Look up the binary in PATH using a platform-native tool. On Windows `where`
    // also handles the implicit `.exe` extension (`where markdown-org-extract`
    // finds `markdown-org-extract.exe` if present), which `execFile` itself
    // does not always do reliably.
    const whichBin = process.platform === 'win32' ? 'where' : 'which';
    try {
        await new Promise<void>((resolve, reject) => {
            exec.execFile(whichBin, [name], { timeout: WHICH_TIMEOUT_MS }, (error) => {
                if (error) {
                    // `ExecFileException` is an interface, not a subclass of
                    // Error, so it is wrapped: the rejection reason should be a
                    // real Error even though the only consumer is the `catch`
                    // below, which discards it.
                    reject(error instanceof Error ? error : new Error(error.message));
                } else {
                    resolve();
                }
            });
        });
    } catch {
        return false;
    }
    return true;
}

/** Paths already checked, so the warning is shown once per session per binary. */
const versionCheckedPaths = new Set<string>();

/** `<binary> --version`, or undefined when the call fails. */
function readExtractorVersion(command: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        exec.execFile(command, ['--version'], { timeout: WHICH_TIMEOUT_MS, encoding: 'utf-8' }, (error, stdout) => {
            resolve(error ? undefined : parseExtractorVersion(stdout));
        });
    });
}

/**
 * Warn once when a user-configured binary is older than the version this
 * release expects. Only the configured path is checked: the bundled one is
 * fetched against the same pin and verified in CI.
 *
 * Failure to run `--version` is treated as "unknown version" and stays silent
 * except for a line in the output channel -- a binary that cannot report its
 * version may still be a working extractor, and the calls that matter report
 * their own errors.
 */
async function warnIfExtractorOutdated(command: string): Promise<void> {
    if (versionCheckedPaths.has(command)) {
        return;
    }
    versionCheckedPaths.add(command);
    const required = requiredExtractorVersion();
    if (!required) {
        return;
    }
    const actual = await readExtractorVersion(command);
    if (!actual) {
        logDiagnostic(`Could not read the version of the configured extractor '${command}'.`);
        return;
    }
    const warning = extractorVersionWarning(actual, required);
    if (warning) {
        notifyWarn(warning);
    }
}

/** The pinned extractor version from the manifest (`x-markdown-org`). */
function requiredExtractorVersion(): string | undefined {
    try {
        const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
            'x-markdown-org'?: { extractorVersion?: string };
        };
        return manifest['x-markdown-org']?.extractorVersion;
    } catch {
        return undefined;
    }
}

async function doResolveExtractorPath(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const customPath = (config.get<string>('extractorPath') ?? '').trim();

    // Priority 1: explicit override via setting. Existing semantics preserved
    // exactly so a user who configured an absolute path or a custom binary
    // name keeps the same behaviour after migrating to v0.6.0.
    if (customPath !== '') {
        if (path.isAbsolute(customPath)) {
            try {
                await fs.promises.access(customPath, fs.constants.X_OK);
            } catch {
                notifyError(
                    `Extractor not found or not executable at '${customPath}'. ` +
                        'Please check markdown-org.extractorPath setting or clear it to use the bundled binary.'
                );
                return undefined;
            }
            await warnIfExtractorOutdated(customPath);
            return customPath;
        }
        if (!(await lookupInPath(customPath))) {
            notifyError(
                `Extractor '${customPath}' not found in PATH. ` +
                    'Please install it or clear markdown-org.extractorPath to use the bundled binary.'
            );
            return undefined;
        }
        await warnIfExtractorOutdated(customPath);
        return customPath;
    }

    // Priority 2: binary shipped inside the VSIX. This file compiles to
    // `<extensionPath>/out/utils/extractor.js`, so `../..` from `__dirname`
    // points at the extension root where `bin/` lives. Falls through when
    // running from a dev checkout that has not fetched the binary
    // (`scripts/download-extractor.sh <target>`).
    const extensionPath = path.resolve(__dirname, '..', '..');
    const bundled = findBundledBinary(extensionPath, process.platform);
    if (bundled !== undefined) {
        return bundled;
    }

    // Priority 3: default name in PATH. Keeps the dev workflow working
    // (developers can have markdown-org-extract globally installed) and
    // gives users a meaningful error if neither bundled nor PATH copy is
    // available.
    if (!(await lookupInPath(EXTRACTOR_DEFAULT))) {
        notifyError(
            `Bundled extractor missing and '${EXTRACTOR_DEFAULT}' not found in PATH. ` +
                'Reinstall the extension or install markdown-org-extract manually: cargo install markdown-org-extract'
        );
        return undefined;
    }
    return EXTRACTOR_DEFAULT;
}

/**
 * Wrapper object so tests can stub `resolveExtractorPath` without redefining
 * the function export.
 */
export const extractor = {
    /**
     * Resolve the path to the markdown-org-extract binary.
     *
     * Lookup order (first match wins):
     * 1. `markdown-org.extractorPath` setting -- absolute path is checked
     *    for x-bit; relative/bare name is looked up in PATH.
     * 2. Bundled binary at `<extensionPath>/bin/markdown-org-extract[.exe]`.
     * 3. `markdown-org-extract` in PATH (dev fallback).
     *
     * On failure shows a user-facing error message and returns `undefined`.
     */
    resolveExtractorPath: doResolveExtractorPath
};
