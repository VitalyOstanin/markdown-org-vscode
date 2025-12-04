import * as vscode from 'vscode';

function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const weekday = dayNames[date.getDay()];
    
    return `<${year}-${month}-${day} ${weekday} ${hour}:${minute}>`;
}

async function findNearestHeading(editor: vscode.TextEditor): Promise<number | null> {
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

export function setTaskStatus(status: 'TODO' | 'DONE') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const line = editor.document.lineAt(editor.selection.active.line);
    const text = line.text;
    const match = text.match(/^(#+)\s+(TODO|DONE)?\s*(?:\[#[A-Z]\]\s*)?(.+)$/);
    
    if (!match) {
        return;
    }

    const [, hashes, currentStatus, title] = match;
    const priorityMatch = text.match(/\[#[A-Z]\]/);
    const priority = priorityMatch ? priorityMatch[0] + ' ' : '';
    
    let newText: string;
    if (currentStatus === status) {
        newText = `${hashes} ${priority}${title.replace(/^\[#[A-Z]\]\s*/, '')}`;
    } else {
        newText = `${hashes} ${status} ${priority}${title.replace(/^\[#[A-Z]\]\s*/, '')}`;
    }

    editor.edit(editBuilder => {
        editBuilder.replace(line.range, newText);
    });
}

export function togglePriority() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const line = editor.document.lineAt(editor.selection.active.line);
    const text = line.text;
    const match = text.match(/^(#+)\s+(TODO|DONE)?\s*(?:\[#([A-Z])\]\s*)?(.+)$/);
    
    if (!match) {
        return;
    }

    const [, hashes, status, currentPriority, title] = match;
    
    let newText = `${hashes} `;
    if (status) {
        newText += `${status} `;
    }
    if (!currentPriority) {
        newText += `[#A] `;
    }
    newText += title.replace(/^\[#[A-Z]\]\s*/, '');

    editor.edit(editBuilder => {
        editBuilder.replace(line.range, newText);
    });
}

export async function insertCreatedTimestamp() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }
    
    const nextLineNum = headingLine + 1;
    
    if (nextLineNum < editor.document.lineCount) {
        const nextLine = editor.document.lineAt(nextLineNum);
        if (nextLine.text.match(/^`CREATED: <[^>]+>`$/)) {
            editor.edit(editBuilder => {
                const deleteRange = new vscode.Range(nextLineNum, 0, nextLineNum + 1, 0);
                editBuilder.delete(deleteRange);
            });
            return;
        }
    }
    
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(nextLineNum, 0);
    
    editor.edit(editBuilder => {
        editBuilder.insert(insertPosition, `\`CREATED: ${timestamp}\`\n`);
    });
}

export async function insertScheduledTimestamp() {
    await insertOrReplaceTimestamp('SCHEDULED');
}

export async function insertDeadlineTimestamp() {
    await insertOrReplaceTimestamp('DEADLINE');
}

async function insertOrReplaceTimestamp(type: 'SCHEDULED' | 'DEADLINE') {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }

    const headingLine = await findNearestHeading(editor);
    if (headingLine === null) {
        return;
    }
    
    const otherType = type === 'SCHEDULED' ? 'DEADLINE' : 'SCHEDULED';
    
    // Search for existing timestamp in consecutive timestamp lines after heading
    let foundLine: number | null = null;
    let foundType: string | null = null;
    let foundTimestamp: string | null = null;
    
    for (let i = headingLine + 1; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        const match = line.text.match(/^`(CREATED|SCHEDULED|DEADLINE): (<[^>]+>)`$/);
        
        if (!match) {
            break;
        }
        
        if (match[1] === type || match[1] === otherType) {
            foundLine = i;
            foundType = match[1];
            foundTimestamp = match[2];
        }
    }
    
    if (foundLine !== null) {
        if (foundType === type) {
            // Remove existing timestamp of same type
            editor.edit(editBuilder => {
                const deleteRange = new vscode.Range(foundLine!, 0, foundLine! + 1, 0);
                editBuilder.delete(deleteRange);
            });
            return;
        } else {
            // Replace other type with current type, keep timestamp
            const newText = `\`${type}: ${foundTimestamp}\``;
            editor.edit(editBuilder => {
                editBuilder.replace(editor.document.lineAt(foundLine!).range, newText);
            });
            return;
        }
    }
    
    // Insert new timestamp after heading
    const timestamp = formatTimestamp(new Date());
    const insertPosition = new vscode.Position(headingLine + 1, 0);
    
    editor.edit(editBuilder => {
        editBuilder.insert(insertPosition, `\`${type}: ${timestamp}\`\n`);
    });
}
