import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { escapeHtml } from '../utils/agendaEscapeHtml';
import { buildHelpSections, searchHelp } from '../utils/helpIndex';
import type { HelpSection } from '../utils/helpIndex';
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
 * a development host is a worse trade than reading eight small files.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- one help panel exists at a time, so its state is static by design; a namespace cannot hold the private statics this keeps
export class DocsPanel {
    private static panel: vscode.WebviewPanel | undefined;
    private static sections: HelpSection[] = [];

    static show(context: vscode.ExtensionContext): void {
        const { language, strings } = DocsPanel.strings();
        DocsPanel.sections = DocsPanel.readSections(context, language);

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

    /**
     * Read the pages of one language, falling back to English page by page: a
     * section added in one language and not yet in the other is better shown in
     * the language it exists in than missing from the contents.
     */
    private static readSections(context: vscode.ExtensionContext, language: string): HelpSection[] {
        const root = path.join(context.extensionPath, 'media', 'help');
        const wanted = path.join(root, language);
        const fallback = path.join(root, 'en');
        const names = new Set([...DocsPanel.pageNames(fallback), ...DocsPanel.pageNames(wanted)]);
        const sources = [...names].map((name) => {
            const own = path.join(wanted, `${name}.md`);
            const file = fs.existsSync(own) ? own : path.join(fallback, `${name}.md`);
            return { name, markdown: DocsPanel.read(file) };
        });
        return buildHelpSections(sources.filter((source) => source.markdown !== ''));
    }

    private static pageNames(directory: string): string[] {
        try {
            return fs
                .readdirSync(directory)
                .filter((file) => file.endsWith('.md'))
                .map((file) => file.slice(0, -'.md'.length));
        } catch {
            // A missing directory is a help panel with fewer pages, not an error
            // worth interrupting the reader with.
            return [];
        }
    }

    private static read(file: string): string {
        try {
            return fs.readFileSync(file, 'utf8');
        } catch {
            return '';
        }
    }

    private static html(webview: vscode.Webview, strings: DocsStrings): string {
        const nonce = randomBytes(16).toString('base64');
        const contents = DocsPanel.sections
            .map((section) => {
                const subs = section.headings
                    .filter((heading) => heading.level === 2)
                    .map(
                        (heading) =>
                            `<li><a class="jump" href="#${heading.slug}" data-slug="${heading.slug}">${escapeHtml(heading.text)}</a></li>`
                    )
                    .join('');
                const first = section.headings[0]?.slug ?? '';
                return (
                    `<li class="section"><a class="jump" href="#${first}" data-slug="${first}">${escapeHtml(section.title)}</a>` +
                    (subs === '' ? '' : `<ul>${subs}</ul>`) +
                    `</li>`
                );
            })
            .join('');
        const body = DocsPanel.sections.map((section) => `<section>${section.html}</section>`).join('\n');
        return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
${DOCS_STYLES}
    </style>
</head>
<body>
    <nav id="contents">
        <input id="search" type="search" placeholder="${escapeHtml(strings.searchPlaceholder)}" aria-label="${escapeHtml(strings.searchPlaceholder)}">
        <div id="hits" hidden></div>
        <h2>${escapeHtml(strings.contents)}</h2>
        <ul>${contents}</ul>
    </nav>
    <main id="pages">
${body}
    </main>
    <script nonce="${nonce}">
${DocsPanel.script(strings)}
    </script>
</body>
</html>`;
    }

    /**
     * The page's own script: jumping to an anchor, and asking the extension for
     * the hits of a search. Everything it needs is passed in as one JSON blob,
     * so the script itself carries no text of its own.
     */
    private static script(strings: DocsStrings): string {
        return `
const vscodeApi = acquireVsCodeApi();
const strings = ${JSON.stringify({ noHits: strings.noHits, hitsTitle: strings.hitsTitle })};
const hitsBox = document.getElementById('hits');
const search = document.getElementById('search');

function jump(slug) {
    const target = document.getElementById(slug);
    if (target) {
        target.scrollIntoView({ block: 'start' });
    }
}

document.addEventListener('click', (event) => {
    const link = event.target.closest('.jump');
    if (!link) {
        return;
    }
    event.preventDefault();
    jump(link.dataset.slug);
});

let typingTimer;
search.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        vscodeApi.postMessage({ type: 'search', term: search.value });
    }, 150);
});

window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.type !== 'hits') {
        return;
    }
    if (message.term.trim() === '') {
        hitsBox.hidden = true;
        hitsBox.textContent = '';
        return;
    }
    hitsBox.hidden = false;
    hitsBox.textContent = '';
    const title = document.createElement('h2');
    title.textContent = strings.hitsTitle;
    hitsBox.append(title);
    if (message.hits.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = strings.noHits;
        hitsBox.append(empty);
        return;
    }
    const list = document.createElement('ul');
    for (const hit of message.hits) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'jump';
        link.href = '#' + hit.slug;
        link.dataset.slug = hit.slug;
        link.textContent = hit.sectionTitle + ' / ' + hit.headingText;
        const line = document.createElement('div');
        line.className = 'hit-line';
        line.textContent = hit.line;
        item.append(link, line);
        list.append(item);
    }
    hitsBox.append(list);
});
`;
    }
}
