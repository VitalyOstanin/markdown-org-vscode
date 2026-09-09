import { escapeHtml } from './agendaEscapeHtml';

/**
 * Render the help pages from markdown to the HTML the docs panel shows.
 *
 * The extension has no runtime dependencies, and the help is the only place
 * that would need a markdown parser -- pulling one in would put it into four
 * VSIX files for one panel. What the help pages are written in is therefore a
 * subset this module implements outright: headings, paragraphs, bullet and
 * numbered lists, fenced code, GFM tables, and inline code, emphasis, strong
 * and links. Anything else in a page renders as the paragraph text it is
 * written as, which is the failure a help page can afford.
 *
 * Everything is escaped first and marked up afterwards, so a page cannot
 * inject markup through its own text; the panel's CSP would refuse a script
 * anyway, but an unbalanced tag would still break the layout of the section
 * after it.
 */

/** A heading the page carries, as the contents and the search read it. */
export interface HelpHeading {
    /** 1 for the page title, 2 and 3 for the headings under it. */
    level: number;
    text: string;
    /** The `id` the rendered heading gets, and the anchor the contents link to. */
    slug: string;
    /**
     * Which rendered block the heading is: the index into the blocks `html`
     * joins. The search reads it to tell which heading a matching line sits
     * under, without parsing the HTML back.
     */
    order: number;
}

export interface RenderedHelp {
    html: string;
    headings: HelpHeading[];
}

const TABLE_DELIMITER = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/**
 * The anchor a heading is reached by.
 *
 * Latin, Cyrillic and digits survive; everything else becomes a hyphen, and
 * runs of hyphens collapse. Two headings with the same text inside one page
 * would collide, so the caller disambiguates by appending an index -- see
 * `renderHelpPage`.
 */
export function headingSlug(text: string): string {
    return text
        .toLowerCase()
        .replaceAll(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replaceAll(/^-+|-+$/g, '');
}

/**
 * Inline markup, applied to already-escaped text.
 *
 * Code spans are taken first and stand aside as placeholders: emphasis and
 * links inside `` `SCHEDULED: <2026-09-09>` `` are text, not markup, and the
 * help pages are full of such spans. The placeholder is an index between two
 * NUL characters: a markdown file that carries one is not something a text
 * editor produced, so a page cannot write a placeholder of its own.
 */
const CODE_MARK = '\u0000';

function renderInline(escaped: string): string {
    const codes: string[] = [];
    const withCodes = escaped.replaceAll(/`([^`]+)`/g, (_match, code: string) => {
        codes.push(code);
        return `${CODE_MARK}${codes.length - 1}${CODE_MARK}`;
    });
    const withMarks = withCodes
        .replaceAll(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) =>
            href.startsWith('https://') || href.startsWith('http://') || href.startsWith('#')
                ? `<a href="${href}">${label}</a>`
                : label
        )
        .replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replaceAll(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // Split rather than matched: a regular expression naming a control
    // character is refused by the linter, and the halves of a split alternate
    // text, index, text -- which is exactly what was put in.
    return withMarks
        .split(CODE_MARK)
        .map((part, index) => (index % 2 === 0 ? part : `<code>${codes[Number(part)] ?? ''}</code>`))
        .join('');
}

/** One row of a GFM table, split on the pipes and trimmed. */
function tableCells(line: string): string[] {
    return line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function renderTable(rows: string[]): string {
    const [header, ...body] = rows;
    const head = tableCells(header ?? '')
        .map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`)
        .join('');
    const lines = body
        .map((row) =>
            tableCells(row)
                .map((cell) => `<td>${renderInline(escapeHtml(cell))}</td>`)
                .join('')
        )
        .map((cells) => `<tr>${cells}</tr>`)
        .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${lines}</tbody></table>`;
}

/**
 * Render one help page.
 *
 * The headings come back alongside the HTML because both the contents and the
 * search are built from them, and walking the rendered HTML for them again
 * would mean parsing what was just produced.
 */
export function renderHelpPage(markdown: string): RenderedHelp {
    const lines = markdown.replaceAll('\r\n', '\n').split('\n');
    const html: string[] = [];
    const headings: HelpHeading[] = [];
    const seen = new Map<string, number>();
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | undefined;
    let table: string[] | undefined;
    let fence: { language: string; body: string[]; marks: number } | undefined;

    const flushParagraph = (): void => {
        if (paragraph.length > 0) {
            html.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
            paragraph = [];
        }
    };
    const flushList = (): void => {
        if (list) {
            const tag = list.ordered ? 'ol' : 'ul';
            const items = list.items.map((item) => `<li>${renderInline(escapeHtml(item))}</li>`).join('');
            html.push(`<${tag}>${items}</${tag}>`);
            list = undefined;
        }
    };
    const flushTable = (): void => {
        if (table) {
            html.push(renderTable(table));
            table = undefined;
        }
    };
    const flushBlocks = (): void => {
        flushParagraph();
        flushList();
        flushTable();
    };

    for (const line of lines) {
        if (fence) {
            // Closed by a run of backticks at least as long as the one that
            // opened it: a block written with four holds a ```org-properties
            // of its own, and a page shows exactly that.
            if (/^`{3,}$/.test(line.trim()) && line.trim().length >= fence.marks) {
                const body = fence.body.map((row) => escapeHtml(row)).join('\n');
                const language = fence.language ? ` class="language-${escapeHtml(fence.language)}"` : '';
                html.push(`<pre><code${language}>${body}</code></pre>`);
                fence = undefined;
            } else {
                fence.body.push(line);
            }
            continue;
        }
        const fenceStart = /^(`{3,})(\S*)\s*$/.exec(line.trim());
        if (fenceStart) {
            flushBlocks();
            fence = { language: fenceStart[2] ?? '', body: [], marks: (fenceStart[1] ?? '```').length };
            continue;
        }

        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
            flushBlocks();
            const level = (heading[1] ?? '#').length;
            const text = (heading[2] ?? '').trim();
            const base = headingSlug(text);
            const times = seen.get(base) ?? 0;
            seen.set(base, times + 1);
            const slug = times === 0 ? base : `${base}-${times}`;
            headings.push({ level, text, slug, order: html.length });
            html.push(`<h${level} id="${slug}">${renderInline(escapeHtml(text))}</h${level}>`);
            continue;
        }

        const bullet = /^[-*]\s+(.*)$/.exec(line);
        const numbered = /^\d+\.\s+(.*)$/.exec(line);
        if (bullet || numbered) {
            flushParagraph();
            flushTable();
            const ordered = Boolean(numbered);
            const item = (bullet?.[1] ?? numbered?.[1] ?? '').trim();
            if (list && list.ordered !== ordered) {
                flushList();
            }
            list ??= { ordered, items: [] };
            list.items.push(item);
            continue;
        }

        if (line.trim().startsWith('|')) {
            flushParagraph();
            flushList();
            // The delimiter row says the line before it was the header; it
            // carries no cells of its own and is dropped here.
            if (TABLE_DELIMITER.test(line.trim())) {
                continue;
            }
            table ??= [];
            table.push(line.trim());
            continue;
        }

        if (line.trim() === '') {
            flushBlocks();
            continue;
        }

        flushList();
        flushTable();
        paragraph.push(line.trim());
    }

    if (fence) {
        // An unterminated fence still has to render: the text is shown as the
        // code it was meant to be rather than swallowed. The blank lines the
        // file ends with are dropped -- they are the line break after the last
        // line of the page, not part of the block.
        const body = [...fence.body];
        while (body.at(-1)?.trim() === '') {
            body.pop();
        }
        html.push(`<pre><code>${body.map((row) => escapeHtml(row)).join('\n')}</code></pre>`);
    }
    flushBlocks();

    return { html: html.join('\n'), headings };
}
