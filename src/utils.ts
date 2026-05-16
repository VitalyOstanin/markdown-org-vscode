import * as vscode from 'vscode';
import * as path from 'path';

export function isPathInsideWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return false;
    }
    const resolved = path.resolve(filePath);
    return folders.some(folder => {
        const folderPath = path.resolve(folder.uri.fsPath);
        if (resolved === folderPath) {
            return true;
        }
        const rel = path.relative(folderPath, resolved);
        return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
}

export function resolveWorkspacePath(p: string): string {
    if (path.isAbsolute(p)) {
        return p;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        return p;
    }
    return path.resolve(root, p);
}

export async function findNearestHeading(editor: vscode.TextEditor): Promise<number | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    );
    
    const position = editor.selection.active;
    
    if (symbols && symbols.length > 0) {
        function findHeading(syms: vscode.DocumentSymbol[], parentLine?: number): number | null {
            let bestMatch: number | null = parentLine ?? null;
            
            for (const sym of syms) {
                if (sym.range.contains(position)) {
                    const symLine = sym.range.start.line;
                    bestMatch = symLine;
                    
                    if (sym.children && sym.children.length > 0) {
                        const childMatch = findHeading(sym.children, symLine);
                        if (childMatch !== null) {
                            bestMatch = childMatch;
                        }
                    }
                    break;
                }
            }
            
            return bestMatch;
        }
        
        return findHeading(symbols);
    }
    
    // Fallback if symbols not available
    for (let line = position.line; line >= 0; line--) {
        const text = editor.document.lineAt(line).text;
        if (/^#+\s+/.test(text)) {
            return line;
        }
    }
    
    return null;
}
