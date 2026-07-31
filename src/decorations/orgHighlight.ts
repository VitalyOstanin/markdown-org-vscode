import * as vscode from 'vscode';
import type { DebouncedFunction } from '../utils/debounce';
import { debounce } from '../utils/debounce';
import type { HighlightKind } from '../utils/orgHighlightSpans';
import { computeHighlightSpans } from '../utils/orgHighlightSpans';

/**
 * Debounce window for repainting after an edit, matching the bracket
 * diagnostics: a typing burst collapses into one pass over the document.
 */
const REPAINT_DEBOUNCE_MS = 300;

/** Setting that turns the editor decorations off. */
const ENABLED_SETTING = 'markdown-org.highlightInEditor';

/**
 * Colour for every highlight kind, as a theme colour token rather than a hex
 * value. These are the same tokens the agenda panel paints with
 * (`agendaStyles.ts`: `--vscode-charts-red` for a DEADLINE and priority A,
 * `--vscode-charts-yellow` for a repeater and priority B, `--vscode-charts-blue`
 * for a SCHEDULED, a time and priority C, `--vscode-charts-green` for DONE,
 * `--vscode-disabledForeground` for a cancelled task), so a task line reads the
 * same in the editor and in the agenda instead of picking up whatever colour a
 * theme happens to give a TextMate scope. The agenda blends its accents a third
 * of the way towards the editor foreground for large surfaces; single words in
 * the editor take the unblended token, which is the more legible of the two on
 * a short run of text.
 */
const KIND_COLORS: Record<HighlightKind, string> = {
    'planning-deadline': 'charts.red',
    'planning-scheduled': 'charts.blue',
    'planning-closed': 'charts.green',
    'planning-created': 'disabledForeground',
    'planning-clock': 'charts.blue',
    date: 'charts.blue',
    weekday: 'charts.blue',
    time: 'charts.blue',
    repeater: 'charts.yellow',
    warning: 'charts.yellow',
    'status-todo': 'charts.blue',
    'status-done': 'charts.green',
    'status-cancelled': 'disabledForeground',
    'priority-a': 'charts.red',
    'priority-b': 'charts.yellow',
    'priority-c': 'charts.blue'
};

function createDecorationTypes(): Map<HighlightKind, vscode.TextEditorDecorationType> {
    const types = new Map<HighlightKind, vscode.TextEditorDecorationType>();
    for (const [kind, color] of Object.entries(KIND_COLORS) as [HighlightKind, string][]) {
        types.set(
            kind,
            vscode.window.createTextEditorDecorationType({
                color: new vscode.ThemeColor(color),
                // The decoration follows the text it was computed for: an edit
                // in the middle of a timestamp otherwise leaves the colour
                // behind on the old columns until the repaint lands.
                rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
            })
        );
    }
    return types;
}

function isEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(ENABLED_SETTING, true);
}

/**
 * The ranges to paint in one document, grouped by kind. Empty for anything but
 * a markdown document, and for every document while the setting is off.
 *
 * The whole document is scanned rather than the visible range: the scan is a
 * regex per line over a task file, and a range-limited scan would have to
 * repaint on every scroll event, which is the more expensive of the two and
 * shows as colour arriving late after a fast scroll.
 *
 * Exported for the integration test: `TextEditor.setDecorations` is a
 * non-writable property, so a test cannot observe the call -- it checks the
 * ranges this produces for a real `TextDocument` instead.
 */
export function documentDecorationRanges(document: vscode.TextDocument): Map<HighlightKind, vscode.Range[]> {
    const byKind = new Map<HighlightKind, vscode.Range[]>();
    if (document.languageId !== 'markdown' || !isEnabled()) {
        return byKind;
    }
    for (let line = 0; line < document.lineCount; line++) {
        for (const span of computeHighlightSpans(document.lineAt(line).text)) {
            let ranges = byKind.get(span.kind);
            if (!ranges) {
                ranges = [];
                byKind.set(span.kind, ranges);
            }
            ranges.push(new vscode.Range(line, span.start, line, span.end));
        }
    }
    return byKind;
}

function paint(editor: vscode.TextEditor, types: Map<HighlightKind, vscode.TextEditorDecorationType>): void {
    const byKind = documentDecorationRanges(editor.document);
    // Kinds absent from the document are cleared explicitly: leaving them out
    // keeps the previous document's ranges on screen after the editor switches
    // files.
    for (const [kind, type] of types) {
        editor.setDecorations(type, byKind.get(kind) ?? []);
    }
}

/**
 * Colour org constructs in the editor: planning keywords, timestamp parts,
 * status keywords and priority cookies.
 *
 * This runs instead of a TextMate injection grammar because the point is to
 * match the agenda's palette, and a grammar only names scopes -- the colour
 * behind a scope belongs to the theme. It also sidesteps the reason the
 * highlighting went missing in the first place: markdown treats a line indented
 * by four spaces as an indented code block and tokenizes nothing inside it,
 * while `markdown-org-extract` reads the planning line at any indentation.
 *
 * Returns a `Disposable` aggregating the decoration types; the caller pushes it
 * into `context.subscriptions`.
 */
export function registerOrgHighlight(context: vscode.ExtensionContext): vscode.Disposable {
    const types = createDecorationTypes();

    const repaintAll = () => {
        for (const editor of vscode.window.visibleTextEditors) {
            paint(editor, types);
        }
    };

    const debouncedByUri = new Map<string, DebouncedFunction<[vscode.TextDocument]>>();
    const scheduleRepaint = (doc: vscode.TextDocument) => {
        const key = doc.uri.toString();
        let pending = debouncedByUri.get(key);
        if (!pending) {
            pending = debounce((changed: vscode.TextDocument) => {
                for (const editor of vscode.window.visibleTextEditors) {
                    if (editor.document === changed) {
                        paint(editor, types);
                    }
                }
            }, REPAINT_DEBOUNCE_MS);
            debouncedByUri.set(key, pending);
        }
        pending(doc);
    };

    repaintAll();

    context.subscriptions.push(
        vscode.window.onDidChangeVisibleTextEditors(repaintAll),
        vscode.workspace.onDidChangeTextDocument((e) => {
            scheduleRepaint(e.document);
        }),
        vscode.workspace.onDidCloseTextDocument((doc) => {
            const key = doc.uri.toString();
            debouncedByUri.get(key)?.cancel();
            debouncedByUri.delete(key);
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(ENABLED_SETTING)) {
                repaintAll();
            }
        })
    );

    const disposable = new vscode.Disposable(() => {
        for (const pending of debouncedByUri.values()) {
            pending.cancel();
        }
        debouncedByUri.clear();
        for (const type of types.values()) {
            type.dispose();
        }
        types.clear();
    });
    context.subscriptions.push(disposable);
    return disposable;
}
