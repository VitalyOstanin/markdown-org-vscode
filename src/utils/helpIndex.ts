import { renderHelpPage } from './helpMarkdown';
import type { HelpHeading } from './helpMarkdown';

/**
 * The help pages, as the docs panel needs them: rendered, ordered, and with an
 * index over their headings for the contents and the search box.
 *
 * The pages ship as markdown under `media/help/<language>/`, one file per
 * section, named so that sorting the file names orders the sections. Reading
 * them off disk is the panel's job -- this module takes what was read, so the
 * ordering, the index and the search stay testable without a file system.
 */

/** One section, as it was read from disk. */
export interface HelpSource {
    /** The file name without its extension: `03-repeaters`. */
    name: string;
    markdown: string;
}

export interface HelpSection {
    /** `03-repeaters`, and the value the panel addresses the section by. */
    id: string;
    /** The `# ` heading of the page; the file name is the fallback. */
    title: string;
    html: string;
    headings: HelpHeading[];
}

export interface HelpSearchHit {
    sectionId: string;
    sectionTitle: string;
    /** The heading the hit sits under, or the page title for text above the first one. */
    headingText: string;
    /** The anchor to scroll to. */
    slug: string;
    /** The line the term was found in, for the list of hits. */
    line: string;
}

/** How many hits the panel is given: a search over seven pages can match a lot. */
export const HELP_SEARCH_LIMIT = 40;

/**
 * Render every page and keep the order the file names give.
 *
 * The order is the file names' because the sections are meant to be read in
 * one: a numeric prefix orders them without a second list to keep in step.
 */
export function buildHelpSections(sources: HelpSource[]): HelpSection[] {
    return [...sources]
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
        .map((source) => {
            const { html, headings } = renderHelpPage(source.markdown);
            return {
                id: source.name,
                title: headings.find((heading) => heading.level === 1)?.text ?? source.name,
                html,
                headings
            };
        });
}

/**
 * Search the help text.
 *
 * Plain substring matching, case-insensitive: the pages are a few thousand
 * words in two languages, and a reader looking for `EXDATE` or "перенос" is
 * better served by every line that names it than by a ranking. Each hit
 * carries the heading above it, so the panel can scroll to that anchor -- the
 * line itself has none.
 */
export function searchHelp(sections: HelpSection[], term: string, limit = HELP_SEARCH_LIMIT): HelpSearchHit[] {
    const needle = term.trim().toLowerCase();
    if (needle === '') {
        return [];
    }
    const hits: HelpSearchHit[] = [];
    for (const section of sections) {
        // The rendered HTML is searched as text: the panel shows the text, and
        // a term split across a tag boundary is not a hit a reader could see.
        for (const line of htmlToLines(section.html)) {
            if (hits.length >= limit) {
                return hits;
            }
            if (!line.text.toLowerCase().includes(needle)) {
                continue;
            }
            const heading = headingAbove(section, line.index);
            hits.push({
                sectionId: section.id,
                sectionTitle: section.title,
                headingText: heading?.text ?? section.title,
                slug: heading?.slug ?? section.headings[0]?.slug ?? '',
                line: line.text
            });
        }
    }
    return hits;
}

/** The heading a line sits under, by the order the headings were rendered in. */
function headingAbove(section: HelpSection, lineIndex: number): HelpHeading | undefined {
    let found: HelpHeading | undefined;
    let seen = 0;
    for (const heading of section.headings) {
        if (heading.order > lineIndex) {
            break;
        }
        found = heading;
        seen += 1;
    }
    return seen === 0 ? undefined : found;
}

/**
 * The text of the rendered HTML, line by line, with the index of the block the
 * line came from so a hit can be tied back to the heading above it.
 */
function htmlToLines(html: string): { index: number; text: string }[] {
    return html
        .split('\n')
        .map((block, index) => ({ index, text: stripTags(block) }))
        .filter((line) => line.text !== '');
}

function stripTags(html: string): string {
    return html
        .replaceAll(/<[^>]+>/g, ' ')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll(/\s+/g, ' ')
        .trim();
}
