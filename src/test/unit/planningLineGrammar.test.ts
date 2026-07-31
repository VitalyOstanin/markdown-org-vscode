import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'mocha';

interface GrammarContribution {
    scopeName: string;
    path: string;
    injectTo?: string[];
}

interface GrammarFile {
    scopeName: string;
    injectionSelector?: string;
    repository?: Record<string, { match?: string; name?: string }>;
}

const ROOT = path.join(__dirname, '..', '..', '..');

function loadContribution(): GrammarContribution {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
        contributes?: { grammars?: GrammarContribution[] };
    };
    const grammars = pkg.contributes?.grammars ?? [];
    const planning = grammars.find((g) => g.scopeName === 'markdown.org.planning-line');
    assert.ok(planning, 'the planning-line grammar is contributed');
    return planning;
}

function loadGrammar(contribution: GrammarContribution): GrammarFile {
    const file = path.join(ROOT, contribution.path);
    assert.ok(fs.existsSync(file), `grammar file ${contribution.path} exists`);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as GrammarFile;
}

/**
 * The grammar's only job is the colour of a planning line's punctuation: it
 * marks the line as inline code, which is the verdict markdown itself reaches
 * only while the line is indented by three spaces or less. Everything else on
 * the line is painted by the decorations.
 */
suite('planning-line injection grammar', () => {
    const contribution = loadContribution();
    const grammar = loadGrammar(contribution);

    test('it is injected into markdown', () => {
        assert.deepStrictEqual(contribution.injectTo, ['text.html.markdown']);
    });

    test('the selector has the L: prefix', () => {
        // Without `L:` the injection runs after the base grammar, and
        // `markup.raw.block.markdown` (a line indented by four spaces) consumes
        // the line first -- exactly the case this grammar exists for.
        assert.strictEqual(grammar.injectionSelector, 'L:text.html.markdown');
    });

    test('the scope is markdown inline code, so the theme decides the colour', () => {
        assert.strictEqual(grammar.repository?.['planning-line']?.name, 'markup.inline.raw.string.markdown');
    });

    test('the pattern matches a planning line at any indentation', () => {
        const pattern = grammar.repository?.['planning-line']?.match;
        assert.ok(pattern, 'the rule carries a match pattern');
        const regex = new RegExp(pattern);
        for (const indent of ['', ' ', '  ', '   ', '    ', '        ', '\t']) {
            for (const keyword of ['SCHEDULED', 'DEADLINE', 'CLOSED', 'CREATED', 'CLOCK']) {
                const line = `${indent}\`${keyword}: <2026-03-03 Tue>\``;
                assert.ok(regex.test(line), `expected a match for ${JSON.stringify(line)}`);
            }
        }
        // Backticks are optional here as well: the extractor reads the line
        // without them, so it has to look the same either way.
        assert.ok(regex.test('    SCHEDULED: <2026-03-03 Tue>'));
    });

    test('the pattern leaves prose and headings alone', () => {
        const pattern = grammar.repository?.['planning-line']?.match;
        assert.ok(pattern, 'the rule carries a match pattern');
        const regex = new RegExp(pattern);
        for (const line of [
            '### TODO [#A] Сдать показания воды',
            'Написать, что задача SCHEDULED на завтра',
            'встреча <2026-03-03 Tue 10:00>',
            '    обычный блок кода'
        ]) {
            assert.ok(!regex.test(line), `expected no match for ${JSON.stringify(line)}`);
        }
    });
});
