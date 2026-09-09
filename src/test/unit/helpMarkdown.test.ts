import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { headingSlug, renderHelpPage } from '../../utils/helpMarkdown';

/**
 * The help pages are rendered by a subset renderer of our own (#181), so the
 * subset itself is what these tests pin: what a page may be written in, and
 * what a page cannot do to the panel around it.
 */
suite('Help markdown', () => {
    test('headings carry an id built from their text', () => {
        const { html, headings } = renderHelpPage('# Repeating tasks\n\n## Moving one occurrence\n');
        assert.ok(html.includes('<h1 id="repeating-tasks">Repeating tasks</h1>'));
        assert.ok(html.includes('<h2 id="moving-one-occurrence">Moving one occurrence</h2>'));
        assert.deepStrictEqual(
            headings.map((heading) => [heading.level, heading.slug]),
            [
                [1, 'repeating-tasks'],
                [2, 'moving-one-occurrence']
            ]
        );
    });

    test('a Cyrillic heading keeps its letters in the anchor', () => {
        assert.strictEqual(headingSlug('Перенос занятия серии'), 'перенос-занятия-серии');
    });

    test('two headings with one text get anchors that differ', () => {
        const { headings } = renderHelpPage('## Commands\n\n## Commands\n');
        assert.deepStrictEqual(
            headings.map((heading) => heading.slug),
            ['commands', 'commands-1']
        );
    });

    test('consecutive lines join into one paragraph', () => {
        const { html } = renderHelpPage('The agenda reads\nthe files it is pointed at.\n');
        assert.strictEqual(html, '<p>The agenda reads the files it is pointed at.</p>');
    });

    test('a blank line starts the next paragraph', () => {
        const { html } = renderHelpPage('First.\n\nSecond.\n');
        assert.strictEqual(html, '<p>First.</p>\n<p>Second.</p>');
    });

    test('bullets and numbers render as the list they are', () => {
        const { html } = renderHelpPage('- one\n- two\n\n1. first\n2. second\n');
        assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
        assert.ok(html.includes('<ol><li>first</li><li>second</li></ol>'));
    });

    test('a fenced block keeps its lines and names its language', () => {
        const { html } = renderHelpPage('```markdown\n## TODO Call\nSCHEDULED: <2026-09-09>\n```\n');
        assert.ok(html.includes('<pre><code class="language-markdown">'));
        assert.ok(html.includes('## TODO Call\nSCHEDULED: &lt;2026-09-09&gt;'));
    });

    test('a table renders with a head and a body, the delimiter row dropped', () => {
        const { html } = renderHelpPage('| Command | What it does |\n| --- | --- |\n| Move | moves it |\n');
        assert.strictEqual(
            html,
            '<table><thead><tr><th>Command</th><th>What it does</th></tr></thead>' +
                '<tbody><tr><td>Move</td><td>moves it</td></tr></tbody></table>'
        );
    });

    test('inline code, strong, emphasis and links are marked up', () => {
        const { html } = renderHelpPage('Use `EXDATE`, **not** *both*, see [the core](https://example.org/x).\n');
        assert.ok(html.includes('<code>EXDATE</code>'));
        assert.ok(html.includes('<strong>not</strong>'));
        assert.ok(html.includes('<em>both</em>'));
        assert.ok(html.includes('<a href="https://example.org/x">the core</a>'));
    });

    test('markup inside a code span stays text', () => {
        const { html } = renderHelpPage('Write `MOVED: 2026-09-09 -> <2026-09-11>` in the entry.\n');
        assert.ok(html.includes('<code>MOVED: 2026-09-09 -&gt; &lt;2026-09-11&gt;</code>'));
        assert.ok(!html.includes('<em>'));
    });

    test('a link to anywhere but http(s) or an anchor renders as its label alone', () => {
        const { html } = renderHelpPage('[open](command:markdown-org.showAgendaDay) it.\n');
        assert.ok(html.includes('open it.'));
        assert.ok(!html.includes('<a '));
    });

    test('a page cannot inject markup of its own', () => {
        const { html } = renderHelpPage('A tag <script>alert(1)</script> and an "attribute".\n');
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
        assert.ok(html.includes('&quot;attribute&quot;'));
    });

    test('a fence of four backticks holds a fence of three, and ends only at four', () => {
        // The repeaters page shows an entry whose properties block is itself
        // fenced; a renderer that closed on the inner ``` swallowed the rest of
        // the page, headings included.
        const page = renderHelpPage(
            '````markdown\n## TODO English\n```org-properties\nEXDATE: 2026-08-13\n```\n````\n\n## After the block\n'
        );
        assert.ok(page.html.includes('```org-properties'));
        assert.deepStrictEqual(
            page.headings.map((heading) => heading.text),
            ['After the block']
        );
    });

    test('an unterminated fence still renders what it holds', () => {
        const { html } = renderHelpPage('```\nSCHEDULED: <2026-09-09>\n');
        assert.ok(html.includes('<pre><code>SCHEDULED: &lt;2026-09-09&gt;</code></pre>'));
    });

    test('a paragraph that reads like an index between NULs is not turned into code', () => {
        // The renderer marks code spans aside as NUL-wrapped indices; a page
        // written by hand cannot carry a NUL, and a digit on its own must not
        // be mistaken for one.
        const { html } = renderHelpPage('The agenda has 3 views.\n');
        assert.strictEqual(html, '<p>The agenda has 3 views.</p>');
    });
});
