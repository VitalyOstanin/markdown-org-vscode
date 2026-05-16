import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from './exec';

const WHICH_TIMEOUT_MS = 5_000;
const EXTRACTOR_DEFAULT = 'markdown-org-extract';

async function doResolveExtractorPath(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('markdown-org');
    const extractorPath = config.get<string>('extractorPath') || EXTRACTOR_DEFAULT;

    if (path.isAbsolute(extractorPath)) {
        try {
            await fs.promises.access(extractorPath, fs.constants.X_OK);
        } catch {
            vscode.window.showErrorMessage(
                `Markdown Org: Extractor not found or not executable at '${extractorPath}'. ` +
                    'Please check markdown-org.extractorPath setting or install: cargo install markdown-org-extract'
            );
            return undefined;
        }
        return extractorPath;
    }

    // Look up the binary in PATH using a platform-native tool. On Windows `where`
    // also handles the implicit `.exe` extension (`where markdown-org-extract`
    // finds `markdown-org-extract.exe` if present), which `execFile` itself
    // does not always do reliably.
    const whichBin = process.platform === 'win32' ? 'where' : 'which';
    try {
        await new Promise<void>((resolve, reject) => {
            exec.execFile(whichBin, [extractorPath], { timeout: WHICH_TIMEOUT_MS }, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    } catch {
        vscode.window.showErrorMessage(
            `Markdown Org: Extractor '${extractorPath}' not found in PATH. ` +
                'Please install markdown-org-extract: cargo install markdown-org-extract'
        );
        return undefined;
    }
    return extractorPath;
}

/**
 * Wrapper object so tests can stub `resolveExtractorPath` without redefining
 * the function export.
 */
export const extractor = {
    /**
     * Resolve and validate the configured `markdown-org.extractorPath`.
     *
     * - Absolute path: checks the file exists and is executable.
     * - Relative path / bare name: checks that PATH contains the binary using
     *   `where` (Windows) or `which` (Unix).
     *
     * On failure shows a user-facing error message and returns `undefined`.
     * Returns the (unchanged) extractor path on success.
     */
    resolveExtractorPath: doResolveExtractorPath
};
