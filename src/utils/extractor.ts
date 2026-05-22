import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from './exec';
import { notifyError } from './notify';
import { findBundledBinary } from './bundledBinary';

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
                    reject(error);
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
            return customPath;
        }
        if (!(await lookupInPath(customPath))) {
            notifyError(
                `Extractor '${customPath}' not found in PATH. ` +
                    'Please install it or clear markdown-org.extractorPath to use the bundled binary.'
            );
            return undefined;
        }
        return customPath;
    }

    // Priority 2: binary shipped inside the VSIX. This file compiles to
    // `<extensionPath>/out/utils/extractor.js`, so `../..` from `__dirname`
    // points at the extension root where `bin/` lives. Falls through when
    // running from a dev checkout without `npm run prepare-bin` first.
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
