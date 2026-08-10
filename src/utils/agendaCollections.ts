/**
 * Collections: which of several scanned directories a task came from.
 *
 * With one directory there is nothing to say, and the agenda looks exactly as
 * it did. From two directories on, every row carries a small coloured dot at
 * the head of its heading, and the dot's tooltip names the directory. A mark
 * rather than a grouping: the agenda is one timeline over every collection, and
 * grouping the rows by where they live would break the axis the layout is built
 * on. The Android client shows the same dot for the same reason.
 *
 * `buildCollectionMarks` runs on the extension host, from the roots the
 * extractor reported; `collectionMarkHtml` renders one row's dot and is inlined
 * into the page through `Function.prototype.toString()`, so its body may only
 * touch its own parameters -- no module-scope imports (the type import below is
 * erased at compile time).
 */

/** One scanned directory, as a row can refer to it. */
export interface CollectionMark {
    /** The root exactly as the extractor reported it in `Task.root`. */
    root: string;
    /** What the tooltip calls it: the directory's own name. */
    name: string;
    /** Palette slot, assigned by order of first appearance. */
    tone: number;
}

/** How many dot colours the stylesheet defines (`.collection[data-tone]`). */
export const COLLECTION_TONES = 5;

/**
 * Marks for the roots a payload holds, in order of first appearance.
 *
 * Fewer than two roots yields nothing: one collection needs no mark, and a
 * single-directory run reports no root at all. Names are the last path segment,
 * widened to two segments for every root whose last segment is not unique --
 * two directories both called `notes` are what the mark exists to tell apart.
 */
export function buildCollectionMarks(roots: readonly string[]): CollectionMark[] {
    if (roots.length < 2) {
        return [];
    }
    const segments = roots.map((root) => root.replaceAll('\\', '/').replace(/\/+$/, '').split('/'));
    const lastCounts = new Map<string, number>();
    for (const parts of segments) {
        const last = parts.at(-1) ?? '';
        lastCounts.set(last, (lastCounts.get(last) ?? 0) + 1);
    }
    return roots.map((root, index) => {
        const parts = segments[index] ?? [];
        const last = parts.at(-1) ?? root;
        const ambiguous = (lastCounts.get(last) ?? 0) > 1;
        const name = ambiguous && parts.length > 1 ? parts.slice(-2).join('/') : last;
        return { root, name: name === '' ? root : name, tone: index % COLLECTION_TONES };
    });
}

/**
 * The dot for one row, or nothing when the row's collection is not among the
 * marks -- which is the usual case: no marks at all while a single directory is
 * scanned.
 */
export function collectionMarkHtml(
    root: string | undefined,
    marks: readonly CollectionMark[],
    ctx: {
        /** `{0}` is the collection name. */
        collectionTooltip: string;
        escapeHtml: (text: string | number | boolean | undefined | null) => string;
        formatString: (template: string, ...values: string[]) => string;
    }
): string {
    if (typeof root !== 'string' || root === '') {
        return '';
    }
    const mark = marks.find((candidate) => candidate.root === root);
    if (!mark) {
        return '';
    }
    const title = ctx.escapeHtml(ctx.formatString(ctx.collectionTooltip, mark.name));
    return `<span class="collection" data-tone="${mark.tone}" title="${title}"></span>`;
}
