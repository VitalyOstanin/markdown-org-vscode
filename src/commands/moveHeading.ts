import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findNearestHeading, isPathInsideWorkspace, requireActiveEditor, resolveWorkspacePath } from '../utils';

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
            vscode.window.showErrorMessage(`Markdown Org: refused to follow symlink at ${filePath}`);
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
    const lines: string[] = [document.lineAt(startLine).text];

    for (let i = startLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const match = line.match(/^(#+)\s+/);
        if (match && match[1].length <= level) {
            break;
        }
        lines.push(line);
    }
    return lines;
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

export async function moveToArchive() {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage('Markdown Org: archive is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    const document = editor.document;
    const heading = await findHeadingAtCursor(editor);
    if (!heading) {
        vscode.window.showErrorMessage('No heading found');
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
    const startLine = heading.line;
    const endLine = heading.line + heading.content.length;
    edit.delete(document.uri, new vscode.Range(startLine, 0, endLine, 0));
    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage(`Moved to ${path.basename(archivePath)}`);
}

export async function promoteToMaintain() {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage('Markdown Org: maintain promotion is disabled in untrusted workspaces');
        return;
    }
    const editor = requireActiveEditor();
    if (!editor) {
        return;
    }

    const config = vscode.workspace.getConfiguration('markdown-org');
    const rawMaintainPath = config.get<string>('maintainFilePath', '');

    if (!rawMaintainPath) {
        vscode.window.showErrorMessage('Markdown Org: Please configure markdown-org.maintainFilePath in settings');
        return;
    }

    const maintainPath = resolveWorkspacePath(rawMaintainPath);
    if (!isPathInsideWorkspace(maintainPath)) {
        vscode.window.showErrorMessage(
            `Markdown Org: maintainFilePath '${rawMaintainPath}' must be inside the workspace`
        );
        return;
    }
    if (await refuseIfSymlink(maintainPath)) {
        return;
    }

    const document = editor.document;
    const heading = await findHeadingAtCursor(editor);
    if (!heading) {
        vscode.window.showErrorMessage('No heading found');
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
    const startLine = heading.line;
    const endLine = heading.line + heading.content.length;
    edit.delete(document.uri, new vscode.Range(startLine, 0, endLine, 0));
    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage(`Promoted to ${path.basename(maintainPath)}`);
}
