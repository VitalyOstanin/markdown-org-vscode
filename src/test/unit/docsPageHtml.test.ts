import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import { buildContents, buildDocsHtml, docsScript, readHelpSources } from '../../utils/docsPageHtml';
import { buildHelpSections } from '../../utils/helpIndex';
import { DOCS_STRINGS } from '../../utils/docsI18n';

/**
 * What the help panel shows, without an editor around it (#181): which file a
 * language falls back to, what the contents lists, and what the page is allowed
 * to load.
 */
function corpus(pages: Record<string, Record<string, string>>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-help-'));
    for (const [language, files] of Object.entries(pages)) {
        fs.mkdirSync(path.join(root, language), { recursive: true });
        for (const [name, markdown] of Object.entries(files)) {
            fs.writeFileSync(path.join(root, language, `${name}.md`), markdown, 'utf8');
        }
    }
    return root;
}

suite('Help pages read from disk', () => {
    test('a page missing from the language falls back to the English one', () => {
        const root = corpus({
            en: { '00-start': '# Start\n', '01-tasks': '# Tasks\n' },
            ru: { '00-start': '# Начало\n' }
        });
        const sources = readHelpSources(root, 'ru');
        assert.deepStrictEqual(
            sources.map((source) => [source.name, source.markdown.trim()]),
            [
                ['00-start', '# Начало'],
                ['01-tasks', '# Tasks']
            ]
        );
    });

    test('a page that exists only in the other language is still carried', () => {
        const root = corpus({ en: { '00-start': '# Start\n' }, ru: { '09-extra': '# Ещё\n' } });
        assert.deepStrictEqual(
            readHelpSources(root, 'ru')
                .map((source) => source.name)
                .sort(),
            ['00-start', '09-extra']
        );
    });

    test('an unknown language reads the English pages', () => {
        const root = corpus({ en: { '00-start': '# Start\n' } });
        assert.deepStrictEqual(
            readHelpSources(root, 'de').map((source) => source.markdown.trim()),
            ['# Start']
        );
    });

    test('a missing help directory is no pages rather than an error', () => {
        assert.deepStrictEqual(readHelpSources(path.join(os.tmpdir(), 'mo-help-absent'), 'en'), []);
    });

    test('an empty file is dropped instead of becoming a section without a title', () => {
        const root = corpus({ en: { '00-start': '# Start\n', '01-empty': '' } });
        assert.deepStrictEqual(
            readHelpSources(root, 'en').map((source) => source.name),
            ['00-start']
        );
    });
});

suite('Help contents', () => {
    const sections = buildHelpSections([
        { name: '00-start', markdown: '# Start\n\nText.\n\n## First step\n\n## Second step\n' },
        { name: '01-tasks', markdown: '# Tasks & notes\n\nText.\n' }
    ]);

    test('every page is listed, its second-level headings under it', () => {
        const html = buildContents(sections);
        assert.ok(html.includes('data-slug="start">Start</a><ul>'));
        assert.ok(html.includes('data-slug="first-step">First step</a>'));
        assert.ok(html.includes('data-slug="second-step">Second step</a>'));
    });

    test('a page without subheadings gets no empty list', () => {
        const html = buildContents(sections);
        assert.ok(html.includes('data-slug="tasks-notes">Tasks &amp; notes</a></li>'));
    });

    test('a title cannot inject markup through the contents', () => {
        const injected = buildHelpSections([{ name: '00-start', markdown: '# <script>alert(1)</script>\n' }]);
        assert.ok(!buildContents(injected).includes('<script>'));
    });
});

suite('Help page', () => {
    const sections = buildHelpSections([{ name: '00-start', markdown: '# Start\n\nText.\n' }]);
    const page = (): string =>
        buildDocsHtml({
            sections,
            strings: DOCS_STRINGS.en,
            cspSource: 'vscode-webview://x',
            nonce: 'NONCE',
            styles: '.docs { color: red; }'
        });

    test('the page loads nothing of its own: only the nonce may run or style it', () => {
        const html = page();
        assert.ok(html.includes("default-src 'none';"));
        assert.ok(html.includes("script-src 'nonce-NONCE';"));
        assert.ok(html.includes("style-src vscode-webview://x 'nonce-NONCE';"));
        assert.ok(!/<script(?![^>]*nonce="NONCE")/.test(html));
        assert.ok(!/<link\b/.test(html));
    });

    test('the stylesheet is inlined rather than fetched', () => {
        assert.ok(page().includes('.docs { color: red; }'));
    });

    test('the rendered sections and the contents are both in the page', () => {
        const html = page();
        assert.ok(html.includes('<section><h1 id="start">Start</h1>'));
        assert.ok(html.includes('<nav id="contents">'));
    });

    test('the search box carries the language its strings are in', () => {
        const ru = buildDocsHtml({
            sections,
            strings: DOCS_STRINGS.ru,
            cspSource: 'vscode-webview://x',
            nonce: 'NONCE',
            styles: ''
        });
        assert.ok(ru.includes(`placeholder="${DOCS_STRINGS.ru.searchPlaceholder}"`));
        assert.ok(ru.includes(`<h2>${DOCS_STRINGS.ru.contents}</h2>`));
    });
});

suite('Help page script', () => {
    test('the words it draws come from the strings passed in, not from the script', () => {
        const script = docsScript(DOCS_STRINGS.ru);
        assert.ok(script.includes(JSON.stringify(DOCS_STRINGS.ru.noHits).slice(1, -1)));
        assert.ok(script.includes('strings.hitsTitle'));
        assert.ok(!script.includes(DOCS_STRINGS.en.noHits));
    });

    test('a hit is drawn as text, never as markup', () => {
        const script = docsScript(DOCS_STRINGS.en);
        assert.ok(script.includes('link.textContent'));
        assert.ok(!script.includes('innerHTML'));
    });

    test('typing is debounced before the extension is asked', () => {
        assert.match(docsScript(DOCS_STRINGS.en), /setTimeout\([\s\S]*?150\)/);
    });
});
