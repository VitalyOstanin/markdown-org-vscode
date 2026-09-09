import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import { buildHelpSections } from '../../utils/helpIndex';

/**
 * The help says the same things the README does, and a second description of
 * the same commands drifts on every edit. The answer is this guard rather than
 * discipline: every command the manifest contributes and every `markdown-org.*`
 * setting it declares has to be named in the help text of both languages.
 *
 * A command or a setting added without a line in the help fails here, which is
 * the moment to write that line -- not the release the reader notices it in.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const LANGUAGES = ['en', 'ru'];

interface Manifest {
    contributes?: {
        commands?: { command: string }[];
        configuration?: { properties?: Record<string, unknown> };
    };
}

function manifest(): Manifest {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest;
}

function pagesOf(language: string): { name: string; markdown: string }[] {
    const directory = path.join(ROOT, 'media', 'help', language);
    return fs
        .readdirSync(directory)
        .filter((file) => file.endsWith('.md'))
        .map((file) => ({
            name: file.slice(0, -'.md'.length),
            markdown: fs.readFileSync(path.join(directory, file), 'utf8')
        }));
}

function textOf(language: string): string {
    return pagesOf(language)
        .map((page) => page.markdown)
        .join('\n');
}

suite('Help coverage (#181)', () => {
    const pkg = manifest();
    const commands = (pkg.contributes?.commands ?? []).map((command) => command.command);
    const settings = Object.keys(pkg.contributes?.configuration?.properties ?? {});

    test('there is something to check', () => {
        assert.ok(commands.length > 0, 'expected contributes.commands to be non-empty');
        assert.ok(settings.length > 0, 'expected contributed settings');
    });

    for (const language of LANGUAGES) {
        test(`every contributed command is named in the ${language} help`, () => {
            const text = textOf(language);
            const missing = commands.filter((command) => !text.includes(command));
            assert.deepStrictEqual(missing, [], `commands missing from the ${language} help`);
        });

        test(`every contributed setting is named in the ${language} help`, () => {
            const text = textOf(language);
            const missing = settings.filter((setting) => !text.includes(setting));
            assert.deepStrictEqual(missing, [], `settings missing from the ${language} help`);
        });

        test(`the ${language} help renders into sections that each have a title`, () => {
            const sections = buildHelpSections(pagesOf(language));
            assert.ok(sections.length > 0, 'expected help pages');
            const untitled = sections.filter((section) => section.title === section.id).map((section) => section.id);
            assert.deepStrictEqual(untitled, [], 'every page must open with a "# " heading');
        });
    }

    test('both languages carry the same pages', () => {
        const [en, ru] = LANGUAGES.map((language) =>
            pagesOf(language)
                .map((page) => page.name)
                .sort()
        );
        assert.deepStrictEqual(ru, en, 'a page exists in one language and not the other');
    });

    test('the help describes moving and cancelling one occurrence of a series', () => {
        // The question the whole panel started from: what a move of one
        // occurrence is written as, and that the older shape is still read.
        for (const language of LANGUAGES) {
            const text = textOf(language);
            for (const term of ['MOVED', 'EXDATE', 'SERIES_ID', 'RECURRENCE_ID']) {
                assert.ok(text.includes(term), `${language} help must name ${term}`);
            }
        }
    });
});
