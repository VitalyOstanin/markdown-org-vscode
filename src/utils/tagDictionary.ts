import type { FileTag } from '../types';

/**
 * One directory's answer about the tags, as it was read.
 *
 * `directory` is what the merged view names as the origin of a pattern, so it
 * carries whatever the caller calls that place -- a path for a notes directory,
 * a word for the settings. Nothing here resolves or compares paths.
 */
export interface TagDeclaration {
    directory: string;
    tags: readonly FileTag[];
}

/** What a pattern does to the files it matches. */
export type TagRole = 'include' | 'exclude' | 'rest';

/** Where one pattern of a merged tag came from, and what it was asked to do. */
export interface TagOrigin {
    pattern: string;
    role: TagRole;
    directory: string;
}

/**
 * A tag as the agenda uses it: one name, everything anybody declared for it.
 *
 * The declarations are merged rather than resolved against each other. Two
 * directories that disagree about what `DRAFT` means both keep their say, and a
 * note matching either of them is in `DRAFT`. What the user is shown is this
 * shape -- the patterns, what each of them does, and which directory asked.
 */
export interface MergedTag {
    name: string;
    /** Patterns selecting files. An empty one selects every file. */
    include: readonly string[];
    /** Patterns keeping files out, whatever `include` says about them. */
    exclude: readonly string[];
    /** Whether the tag was declared as "everything no other tag claims". */
    rest: boolean;
    origins: readonly TagOrigin[];
}

function asStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/**
 * Read one declared entry into patterns and their roles.
 *
 * Two spellings, because the second grew out of the first. `pattern` is the
 * original single-string form the settings still use, where a leading `!`
 * marks the tag as "everything else". `include`/`exclude` is the form a tags
 * file can use to say both things about one tag at once, which a single
 * string cannot.
 */
function rolesOf(tag: FileTag): { pattern: string; role: TagRole }[] {
    const out: { pattern: string; role: TagRole }[] = [];
    if (typeof tag.pattern === 'string') {
        // The text after '!' has never meant anything: '!', '!work' and '!xyz'
        // all say "whatever no tag claims". Kept that way -- configurations in
        // the wild spell it every one of those ways.
        out.push(
            tag.pattern.startsWith('!')
                ? { pattern: tag.pattern, role: 'rest' }
                : { pattern: tag.pattern, role: 'include' }
        );
    }
    for (const pattern of asStrings(tag.include)) {
        out.push({ pattern, role: 'include' });
    }
    for (const pattern of asStrings(tag.exclude)) {
        out.push({ pattern, role: 'exclude' });
    }
    return out;
}

/**
 * Merge what every directory declared into one dictionary.
 *
 * The dictionary is global on purpose: a tag means the same thing wherever the
 * note came from, so a directory that never heard of `WORK` is filtered by it
 * like any other. The alternative -- a tag whose meaning depends on the
 * directory of the note -- makes the same name select different notes on two
 * screens showing the same agenda, and makes the order of the directory list
 * part of the answer.
 *
 * Order is first-seen: the tags of the first directory come first, and a name
 * only that directory declares stays where it was. A repeated pattern for the
 * same name and role is stored once, but every directory that asked for it is
 * kept in `origins` -- that list is what the tag screen shows.
 */
export function mergeTagDictionaries(declarations: readonly TagDeclaration[]): MergedTag[] {
    const byName = new Map<string, { include: string[]; exclude: string[]; rest: boolean; origins: TagOrigin[] }>();

    for (const declaration of declarations) {
        for (const tag of declaration.tags) {
            // A file on disk can hold anything JSON allows. An entry without a
            // usable name names no tag at all, so it is dropped rather than
            // merged under `undefined`.
            if (typeof tag.name !== 'string' || tag.name === '') {
                continue;
            }
            const roles = rolesOf(tag);
            if (roles.length === 0) {
                continue;
            }
            const entry = byName.get(tag.name) ?? { include: [], exclude: [], rest: false, origins: [] };
            for (const { pattern, role } of roles) {
                if (role === 'rest') {
                    entry.rest = true;
                } else {
                    const bucket = role === 'include' ? entry.include : entry.exclude;
                    if (!bucket.includes(pattern)) {
                        bucket.push(pattern);
                    }
                }
                entry.origins.push({ pattern, role, directory: declaration.directory });
            }
            byName.set(tag.name, entry);
        }
    }

    return [...byName].map(([name, entry]) => ({
        name,
        include: entry.include,
        exclude: entry.exclude,
        rest: entry.rest,
        origins: entry.origins
    }));
}

/**
 * Whether a tag claims a file by a pattern that tells files apart.
 *
 * Two things are not a claim. An exclusion is not: a file the tag refuses is
 * not the tag's, which is what lets the rest pick it up instead of it falling
 * out of every tag at once. And an empty pattern is not: a tag taking every
 * file says "no filtering" rather than "these are mine", so `ALL` sitting in
 * the dictionary must not empty the rest of everything.
 *
 * A tag whose only declaration is `rest` claims nothing here -- that is what
 * keeps this from asking itself the same question forever.
 */
function claims(basename: string, tag: MergedTag): boolean {
    if (tag.exclude.some((pattern) => basename.includes(pattern))) {
        return false;
    }
    return tag.include.some((pattern) => pattern !== '' && basename.includes(pattern));
}

/**
 * Whether a file belongs to a tag.
 *
 * Three rules, in this order:
 *
 *   1. Excluding wins. A pattern that keeps a file out keeps it out however
 *      many directories include it -- otherwise an exclusion could be undone by
 *      a directory that never heard of it, and "everything but the archive"
 *      would be unsayable the moment a second directory joined the agenda.
 *   2. Including patterns are alternatives. The merge kept all of them, so
 *      anything any directory calls `WORK` is `WORK`. An empty pattern among
 *      them selects every file, which is how `ALL` keeps working when one
 *      directory declares it and another does not -- and, by rule 1, an
 *      exclusion still applies to it.
 *   3. A resting tag takes every file no tag ended up claiming -- see
 *      {@link claims} for what counts as one. Measured after the exclusions,
 *      not against the raw patterns: a note thrown out of `WORK` belongs to no
 *      tag, and the rest is where "no tag" lives. Read the other way --
 *      "matches no including pattern anywhere" -- an excluded note would be in
 *      nothing at all and invisible under every filter.
 */
export function fileMatchesTag(basename: string, tag: MergedTag, dictionary: readonly MergedTag[]): boolean {
    if (tag.exclude.some((pattern) => basename.includes(pattern))) {
        return false;
    }
    if (tag.include.some((pattern) => pattern === '' || basename.includes(pattern))) {
        return true;
    }
    return tag.rest && !dictionary.some((other) => claims(basename, other));
}
