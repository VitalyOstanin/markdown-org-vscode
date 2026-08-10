import type { MergedTag, TagOrigin } from './tagDictionary';

/**
 * What a tag origin is called when it did not come from a directory.
 *
 * The declarations carry an empty directory for the settings (see
 * `tagSources.SETTINGS_ORIGIN`); the report is where that becomes a word.
 */
const SETTINGS_LABEL = 'settings';

function label(directory: string): string {
    return directory === '' ? SETTINGS_LABEL : directory;
}

function describeRole(origin: TagOrigin): string {
    switch (origin.role) {
        case 'include':
            return origin.pattern === '' ? 'takes every note' : `takes notes whose name holds "${origin.pattern}"`;
        case 'exclude':
            return `keeps out notes whose name holds "${origin.pattern}"`;
        case 'rest':
            return 'takes what no other tag takes';
    }
}

/**
 * The dictionary written out as Markdown, one section per tag.
 *
 * Answering "what am I filtering by, and who decided that" -- a question the
 * dropdown cannot, because by the time a tag reaches it, several directories
 * and the settings have been merged into one name. Each pattern is listed with
 * what it does and where it was declared, so a tag that behaves unexpectedly
 * can be traced to the file that says so.
 *
 * Markdown rather than a webview: the report is read once, is worth copying
 * into a message, and a panel for it would be a second thing to keep in step
 * with the agenda.
 */
export function renderTagDictionaryReport(dictionary: readonly MergedTag[]): string {
    if (dictionary.length === 0) {
        return [
            '# File tags',
            '',
            'No tags are declared.',
            '',
            'A notes directory declares them in `.markdown-org/tags.json`, and the',
            'setting `markdown-org.fileTags` declares them beside it. Without either,',
            'the agenda shows every note it scans.'
        ].join('\n');
    }

    const lines: string[] = ['# File tags', ''];
    lines.push(
        'Every directory of the agenda declares tags of its own, and the settings',
        'declare theirs; what follows is the one dictionary they merge into. A tag',
        'means the same thing wherever a note came from, so a directory that never',
        'named a tag is filtered by it like any other.',
        ''
    );

    for (const tag of dictionary) {
        lines.push(`## ${tag.name}`, '');
        for (const origin of tag.origins) {
            lines.push(`- ${describeRole(origin)} — declared by ${label(origin.directory)}`);
        }
        if (tag.exclude.length > 0 && tag.include.length > 0) {
            lines.push('', 'Keeping out wins over taking in: a note matching both is out.');
        }
        lines.push('');
    }

    return lines.join('\n');
}
