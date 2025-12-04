import * as vscode from 'vscode';

export async function findNearestHeading(editor: vscode.TextEditor): Promise<number | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    );
    
    if (!symbols || symbols.length === 0) {
        return null;
    }
    
    const position = editor.selection.active;
    
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
