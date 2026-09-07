import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

/**
 * That the things this project defines once stay defined once.
 *
 * Each of these was written out again beside its own use -- a weekday class in
 * nine patterns, a `YYYY-MM-DD` parsed three ways -- and the copies then drifted
 * apart. The rule is not "no duplication anywhere": it is that these particular
 * answers have one home, and a second literal is how they stopped agreeing.
 *
 * Counted rather than judged: the test names the file each answer lives in and
 * the number of places the pattern may appear, so a new copy fails here with
 * the file that made it. Two files are deliberately exempt from the date rule
 * and named as such -- their sources are inlined into the agenda page through
 * `Function.prototype.toString()`, where no import binding exists.
 */
suite('one answer, one place', () => {
    const src = path.resolve(__dirname, '..', '..', '..', 'src');

    /** Every `.ts` file of `src`, tests excluded -- they may write what they check. */
    function sources(): string[] {
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'test') {
                        walk(full);
                    }
                } else if (entry.name.endsWith('.ts')) {
                    found.push(full);
                }
            }
        };
        walk(src);
        return found;
    }

    /** The files whose text matches `pattern`, named the way a failure can be read. */
    function filesMatching(pattern: RegExp): string[] {
        return sources()
            .filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
            .map((file) => path.relative(src, file))
            .sort();
    }

    test('the characters a weekday is written with are named once', () => {
        assert.deepStrictEqual(
            filesMatching(/\[А-Яа-яA-Za-z\]/),
            ['orgPatterns.ts'],
            'a weekday class outside orgPatterns.ts: use WEEKDAY_SOURCE or isWeekdayName'
        );
    });

    /**
     * The page's own sources, which cannot call `fromIsoDate`: each is written
     * into a `<script>` by `Function.prototype.toString()`, and a body that
     * reaches for a module binding is a `ReferenceError` in the page. See
     * inlinedHelpers.test.ts, which is what holds that rule.
     */
    const INLINED = new Set(['utils/formatIsoDate.ts', 'utils/agendaDayHeader.ts', 'webview/agendaClient.ts']);

    test('a day is read out of YYYY-MM-DD in one place', () => {
        // The shape of the copies: the parts split off a string and handed to
        // `new Date`, where the month is the one turned into an index.
        assert.deepStrictEqual(
            filesMatching(/split\('-'\)[\s\S]{0,200}new Date\([\s\S]{0,60}- 1/).filter((file) => !INLINED.has(file)),
            [],
            'a date parsed beside its use: call fromIsoDate from utils/isoDate'
        );
    });

    test('the sources the agenda page inlines parse their own day, and say why', () => {
        for (const file of INLINED) {
            const text = fs.readFileSync(path.join(src, file), 'utf8');
            assert.match(text, /new Date\(/, `${file} no longer parses its own day`);
            assert.match(text, /[Ii]nlined |\.toString\(\)/, `${file} does not say why it parses its own day`);
        }
    });

    test('a heading is turned into its text in one place', () => {
        assert.deepStrictEqual(
            filesMatching(/replace\(\/\^#\+/),
            [],
            'a heading stripped by hand: call headingTitle from orgPatterns'
        );
    });

    /**
     * That the occurrence commands say what they say through the dictionary.
     *
     * The section was in `agendaI18n` before the commands were written, and
     * they were written with English literals anyway -- a feature half in one
     * language and half in the other, on a setting that says which.
     */
    test('the occurrence commands speak through the dictionary', () => {
        // The keys of VS Code's own chords, which name themselves in any language.
        const keyNames = new Set(["'Shift+Up'", "'Shift+Down'"]);
        const text = fs.readFileSync(path.join(src, 'commands', 'occurrence.ts'), 'utf8');
        const shown =
            /(?:title|prompt|placeHolder|label|description):\s*('[^']*')|notify\w+\(\s*('[^']*'|`[^`]*`)|formatString\(\s*('[^']*')/g;
        const literals = [...text.matchAll(shown)]
            .map((hit) => hit[1] ?? hit[2] ?? hit[3] ?? '')
            .filter((literal) => literal !== '' && !keyNames.has(literal));

        assert.deepStrictEqual(literals, [], 'a line the user reads, written in place: add it to agendaI18n');
    });

    test('a diagnostic collection is wired into the editor in one place', () => {
        assert.deepStrictEqual(
            filesMatching(/createDiagnosticCollection\(/),
            ['diagnostics/registerDiagnostics.ts'],
            'a diagnostic wired by hand: call registerDocumentDiagnostics'
        );
    });
});
