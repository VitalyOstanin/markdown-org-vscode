import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findNearestHeading, isPathInsideWorkspace, requireActiveEditor, resolveWorkspacePath } from '../utils';
import { notifyError, notifyInfo, notifyWarn } from '../utils/notify';
import { computeBlockDeletionCoords } from '../utils/blockDeletion';
import { extractHeadingBlockLines } from '../utils/extractHeading';

async function readIfExists(filePath: string): Promise<string | null> {
    try {
        return await fs.promises.readFile(filePath, 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw err;
    }
}

async function refuseIfSymlink(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.promises.lstat(filePath);
        if (stat.isSymbolicLink()) {
            notifyError(`refused to follow symlink at ${filePath}`);
            return true;
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw err;
        }
    }
    return false;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(tmpPath, content);
    try {
        await fs.promises.rename(tmpPath, filePath);
    } catch (err) {
        await fs.promises.unlink(tmpPath).catch(() => undefined);
        throw err;
    }
}

interface HeadingInfo {
    level: number;
    text: string;
    line: number;
    content: string[];
}

async function findHeadingAtCursor(editor: vscode.TextEditor): Promise<HeadingInfo | null> {
    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return null;
    }
    const lineText = editor.document.lineAt(headingLine).text;
    const match = lineText.match(/^(#+)\s+(.+)$/);
    if (!match) {
        return null;
    }
    const level = match[1].length;
    const text = match[2];
    const content = extractHeadingContent(editor.document, headingLine, level);
    return { level, text, line: headingLine, content };
}

function extractHeadingContent(document: vscode.TextDocument, startLine: number, level: number): string[] {
    // One getText() + split is cheaper than N independent `lineAt(i).text`
    // calls on large markdown files. Splitting on /\r?\n/ matches the
    // per-line strings VS Code's TextLine.text would have surfaced (the API
    // strips the EOL itself; we strip it explicitly here).
    const allLines = document.getText().split(/\r?\n/);
    return extractHeadingBlockLines(allLines, startLine, level);
}

function getAncestorChain(document: vscode.TextDocument, startLine: number, targetLevel: number): HeadingInfo[] {
    const ancestors: HeadingInfo[] = [];
    let currentLevel = targetLevel;

    for (let i = startLine - 1; i >= 0; i--) {
        const line = document.lineAt(i).text;
        const match = line.match(/^(#+)\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            if (level < currentLevel) {
                ancestors.unshift({ level, text: match[2], line: i, content: [] });
                currentLevel = level;
                if (level === 1) break;
            }
        }
    }
    return ancestors;
}

function computeBlockDeletionRange(
    document: vscode.TextDocument,
    startLine: number,
    contentLength: number
): vscode.Range {
    const c = computeBlockDeletionCoords(
        {
            lineCount: document.lineCount,
            getLineLength: (lineIndex) => document.lineAt(lineIndex).text.length
        },
        startLine,
        contentLength
    );
    return new vscode.Range(c.startLine, c.startCharacter, c.endLine, c.endCharacter);
}

function buildArchiveContent(ancestors: HeadingInfo[], heading: HeadingInfo): string {
    let content = '';

    ancestors.forEach((ancestor) => {
        content += '#'.repeat(ancestor.level) + ' ' + ancestor.text + '\n';
    });

    heading.content.forEach((line) => {
        content += line + '\n';
    });

    return content;
}

/**
 * Cut the nearest heading and append it to a sibling `<file>.archive.md` file,
 * preserving the ancestor chain. Atomic write; refuses to follow symlinks.
 * Disabled in untrusted workspaces.
 */
export async function moveToArchive() {
    if (!vscode.workspace.isTrusted) {
        notifyWarn('archive is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    const document = editor.document;
    const heading = await findHeadingAtCursor(editor);
    if (!heading) {
        notifyError('No heading found');
        return;
    }

    const archivePath = document.uri.fsPath + '.archive.md';
    if (await refuseIfSymlink(archivePath)) {
        return;
    }
    const ancestors = getAncestorChain(document, heading.line, heading.level);
    const archiveContent = buildArchiveContent(ancestors, heading);

    let existingContent = (await readIfExists(archivePath)) ?? '';
    if (existingContent && !existingContent.endsWith('\n\n')) {
        existingContent += existingContent.endsWith('\n') ? '\n' : '\n\n';
    }

    await atomicWrite(archivePath, existingContent + archiveContent);

    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, computeBlockDeletionRange(document, heading.line, heading.content.length));
    await vscode.workspace.applyEdit(edit);

    notifyInfo(`Moved to ${path.basename(archivePath)}`);
}

/**
 * Cut the nearest heading and move it into `markdown-org.maintainFilePath` under the `# incoming`
 * section, normalizing all heading levels relative to a new `## ` root. Atomic write; refuses
 * symlinks; the maintain file must be inside the workspace. Disabled in untrusted workspaces.
 */
export async function promoteToMaintain() {
    if (!vscode.workspace.isTrusted) {
        notifyWarn('maintain promotion is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    const config = vscode.workspace.getConfiguration('markdown-org');
    const rawMaintainPath = config.get<string>('maintainFilePath', '');

    if (!rawMaintainPath) {
        notifyError('Please configure markdown-org.maintainFilePath in settings');
        return;
    }

    const maintainPath = resolveWorkspacePath(rawMaintainPath);
    if (!isPathInsideWorkspace(maintainPath)) {
        notifyError(`maintainFilePath '${rawMaintainPath}' must be inside the workspace`);
        return;
    }
    if (await refuseIfSymlink(maintainPath)) {
        return;
    }

    const document = editor.document;
    const heading = await findHeadingAtCursor(editor);
    if (!heading) {
        notifyError('No heading found');
        return;
    }

    let maintainContent = (await readIfExists(maintainPath)) ?? '';

    const lines = maintainContent.split('\n');
    let incomingIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^#\s+incoming$/i)) {
            incomingIndex = i;
            break;
        }
    }

    const delta = 2 - heading.level;
    const newHeading = '## ' + heading.text;
    const newContent = heading.content.slice(1).map((line) => {
        const match = line.match(/^(#+)\s+(.+)$/);
        if (match) {
            const newLevel = Math.min(6, Math.max(1, match[1].length + delta));
            return '#'.repeat(newLevel) + ' ' + match[2];
        }
        return line;
    });

    if (incomingIndex === -1) {
        maintainContent += (maintainContent && !maintainContent.endsWith('\n\n') ? '\n\n' : '') + '# incoming\n';
        maintainContent += newHeading + '\n' + newContent.join('\n') + '\n';
    } else {
        lines.splice(incomingIndex + 1, 0, newHeading, ...newContent, '');
        maintainContent = lines.join('\n');
    }

    await atomicWrite(maintainPath, maintainContent);

    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, computeBlockDeletionRange(document, heading.line, heading.content.length));
    await vscode.workspace.applyEdit(edit);

    notifyInfo(`Promoted to ${path.basename(maintainPath)}`);
}
