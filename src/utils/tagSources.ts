import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileTag } from '../types';
import type { TagDeclaration } from './tagDictionary';
import { formatError } from './formatError';

/**
 * Where a skipped file is reported.
 *
 * Passed in rather than imported: the log channel of the extension needs
 * `vscode`, and this module answers a question about files on disk that the
 * unit tests ask without an editor around them.
 */
export type ReportSkipped = (message: string) => void;

/**
 * Where a notes directory keeps the tags it declares.
 *
 * Inside a directory of its own rather than loose in the notes: the file sits
 * in the git checkout the notes are synced through, which is what carries it to
 * the other clients, and a place for the shared settings to grow is better than
 * a second dotted file next to the notes later.
 */
export const TAGS_FILE = path.join('.markdown-org', 'tags.json');

/**
 * What `origin.directory` says for the tags that came from the settings.
 *
 * Empty because a path is never empty: the tag screen can tell the two apart
 * without a flag beside the string, and no directory can collide with it.
 */
export const SETTINGS_ORIGIN = '';

function isFileTagArray(value: unknown): value is FileTag[] {
    return Array.isArray(value);
}

/**
 * Read one directory's declaration, or nothing when it has none.
 *
 * A missing file is the normal state and is not reported: most directories
 * never declare tags, and a message per agenda refresh per directory would say
 * nothing. Everything else -- unreadable file, JSON that will not parse, JSON
 * that is not a list -- goes to the log and the directory is skipped. Skipped
 * rather than fatal: the tags of the other directories still describe the
 * agenda, and an agenda that refuses to render over a stray comma would be
 * worse than one filtered by a smaller dictionary.
 */
async function readDirectoryTags(directory: string, report: ReportSkipped): Promise<TagDeclaration | undefined> {
    const file = path.join(directory, TAGS_FILE);
    let text: string;
    try {
        text = await fs.readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            report(`tags of ${directory} unreadable: ${formatError(error)}`);
        }
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(text);
        if (!isFileTagArray(parsed)) {
            report(`tags of ${directory} ignored: ${file} holds ${typeof parsed}, not a list of tags`);
            return undefined;
        }
        return { directory, tags: parsed };
    } catch (error) {
        report(`tags of ${directory} unparsable: ${formatError(error)}`);
        return undefined;
    }
}

/**
 * Every declaration behind the agenda's dictionary.
 *
 * The directories come first and the settings last, which decides nothing about
 * what a tag selects -- the merge is order-independent -- and only orders the
 * tags on screen: a directory that carries its tags leads with them, and a
 * workspace with no files at all keeps the order of `markdown-org.fileTags` it
 * has always had.
 *
 * The settings are read as a source beside the files rather than instead of
 * them. A tag configured here and a tag carried by the notes are both things
 * the user asked for, and dropping one because the other exists would make a
 * file appearing in one directory silently retire the settings.
 */
export async function readTagDeclarations(
    directories: readonly string[],
    settingsTags: readonly FileTag[],
    report: ReportSkipped = () => undefined
): Promise<TagDeclaration[]> {
    const fromFiles = await Promise.all(directories.map((directory) => readDirectoryTags(directory, report)));
    const declarations = fromFiles.filter((declaration): declaration is TagDeclaration => declaration !== undefined);
    if (settingsTags.length > 0) {
        declarations.push({ directory: SETTINGS_ORIGIN, tags: settingsTags });
    }
    return declarations;
}
