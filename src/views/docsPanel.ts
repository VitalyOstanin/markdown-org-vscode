import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { buildHelpSections, searchHelp } from '../utils/helpIndex';
import type { HelpSection } from '../utils/helpIndex';
import { buildDocsHtml, readHelpSources } from '../utils/docsPageHtml';
import { currentUiStrings } from '../utils/uiStrings';
import type { UiLanguage } from '../utils/agendaI18n';
import { DOCS_STRINGS } from '../utils/docsI18n';
import type { DocsStrings } from '../utils/docsI18n';
import { DOCS_STYLES } from './docsStyles';

/**
 * The help panel.
 *
 * There is no in-editor help besides this: `contributes` declares commands,
 * settings, grammars and keybindings, and a reader who never opens the
 * marketplace page has only the tooltips inside the agenda. A walkthrough was
 * weighed and dropped -- its cards are declared in `package.json` and follow
 * the editor's display language, so they cannot follow `markdown-org.uiLanguage`
 * -- and so was opening the shipped README in the markdown preview, which
 * leans on `<picture>` and on GIFs that stay out of the VSIX.
 *
 * The pages are markdown under `media/help/<language>/`, read at open time and
 * rendered by `helpMarkdown`. They are read again on every open rather than
 * cached: opening the help is a rare act, and a stale copy of a page edited in
 * a development host is a worse trade than reading eight small files. What is
 * read and what it becomes live in `docsPageHtml`; this class is the webview
 * around them.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- one help panel exists at a time, so its state is static by design; a namespace cannot hold the private statics this keeps
export class DocsPanel {
    private static panel: vscode.WebviewPanel | undefined;
    private static sections: HelpSection[] = [];

    static show(context: vscode.ExtensionContext): void {
        const { language, strings } = DocsPanel.strings();
        DocsPanel.sections = buildHelpSections(
            readHelpSources(path.join(context.extensionPath, 'media', 'help'), language)
        );

        if (DocsPanel.panel) {
            // Reopened rather than left as it was: the language or the pages may
            // have changed since, and the panel is cheap to rebuild.
            DocsPanel.panel.title = strings.title;
            DocsPanel.panel.webview.html = DocsPanel.html(DocsPanel.panel.webview, strings);
            DocsPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        DocsPanel.panel = vscode.window.createWebviewPanel('markdownOrgHelp', strings.title, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            // Ctrl+F over the rendered help, the same way the agenda offers it.
            enableFindWidget: true,
            // Nothing is loaded from disk by the page: the markdown is read by
            // the extension and the HTML it becomes is inlined.
            localResourceRoots: []
        });
        DocsPanel.panel.onDidDispose(() => {
            DocsPanel.panel = undefined;
            DocsPanel.sections = [];
        });
        DocsPanel.panel.webview.onDidReceiveMessage((message: unknown) => {
            DocsPanel.handleMessage(message);
        });
        DocsPanel.panel.webview.html = DocsPanel.html(DocsPanel.panel.webview, strings);
    }

    /**
     * The search runs in the extension, not in the page: the same index the
     * unit tests cover answers it, and the page only draws the hits.
     */
    private static handleMessage(message: unknown): void {
        if (typeof message !== 'object' || message === null) {
            return;
        }
        const { type, term } = message as { type?: unknown; term?: unknown };
        if (type !== 'search' || typeof term !== 'string') {
            return;
        }
        void DocsPanel.panel?.webview.postMessage({
            type: 'hits',
            term,
            hits: searchHelp(DocsPanel.sections, term)
        });
    }

    private static strings(): { language: UiLanguage; strings: DocsStrings } {
        const { language } = currentUiStrings();
        return { language, strings: DOCS_STRINGS[language] };
    }

    private static html(webview: vscode.Webview, strings: DocsStrings): string {
        return buildDocsHtml({
            sections: DocsPanel.sections,
            strings,
            cspSource: webview.cspSource,
            nonce: randomBytes(16).toString('base64'),
            styles: DOCS_STYLES
        });
    }
}
