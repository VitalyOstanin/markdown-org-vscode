import * as fs from 'node:fs';
import * as path from 'node:path';
import { escapeHtml } from './agendaEscapeHtml';
import type { HelpSection, HelpSource } from './helpIndex';
import type { DocsStrings } from './docsI18n';

/**
 * The help panel's page, and the reading that precedes it.
 *
 * The panel itself is a webview and a message channel; everything that decides
 * what the reader sees -- which file a language falls back to, what the
 * contents lists, what the page is allowed to load -- lives here, where the
 * unit tests reach it without an editor.
 */

/**
 * Read the pages of one language, falling back to English page by page: a
 * section added in one language and not yet in the other is better shown in the
 * language it exists in than missing from the contents.
 */
export function readHelpSources(root: string, language: string): HelpSource[] {
    const wanted = path.join(root, language);
    const fallback = path.join(root, 'en');
    const names = new Set([...pageNames(fallback), ...pageNames(wanted)]);
    return [...names]
        .map((name) => {
            const own = path.join(wanted, `${name}.md`);
            const file = fs.existsSync(own) ? own : path.join(fallback, `${name}.md`);
            return { name, markdown: read(file) };
        })
        .filter((source) => source.markdown !== '');
}

function pageNames(directory: string): string[] {
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

function read(file: string): string {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return '';
    }
}

/** The contents: every page, and the second-level headings under it. */
export function buildContents(sections: HelpSection[]): string {
    return sections
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
}

export interface DocsPageInput {
    sections: HelpSection[];
    strings: DocsStrings;
    /** The webview's own source, the only origin the styles may come from. */
    cspSource: string;
    nonce: string;
    /** The stylesheet, inlined: the page loads nothing from disk. */
    styles: string;
}

export function buildDocsHtml({ sections, strings, cspSource, nonce, styles }: DocsPageInput): string {
    const body = sections.map((section) => `<section>${section.html}</section>`).join('\n');
    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
${styles}
    </style>
</head>
<body>
    <nav id="contents">
        <input id="search" type="search" placeholder="${escapeHtml(strings.searchPlaceholder)}" aria-label="${escapeHtml(strings.searchPlaceholder)}">
        <div id="hits" hidden></div>
        <h2>${escapeHtml(strings.contents)}</h2>
        <ul>${buildContents(sections)}</ul>
    </nav>
    <main id="pages">
${body}
    </main>
    <script nonce="${nonce}">
${docsScript(strings)}
    </script>
</body>
</html>`;
}

/**
 * The page's own script: jumping to an anchor, and asking the extension for the
 * hits of a search. Everything it needs is passed in as one JSON blob, so the
 * script itself carries no text of its own.
 */
export function docsScript(strings: DocsStrings): string {
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
