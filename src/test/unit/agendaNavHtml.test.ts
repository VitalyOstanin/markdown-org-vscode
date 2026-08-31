import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { JSDOM } from 'jsdom';
import {
    renderDateNav,
    renderHeaderModeButton,
    renderHeroHtml,
    renderModeSwitch,
    renderNavBarHtml,
    renderTagMenu,
    tagButtonText,
    tagLabel
} from '../../utils/agendaNavHtml';
import { AGENDA_STRINGS } from '../../utils/agendaI18n';
import { nextHeaderMode } from '../../utils/agendaHeaderMode';

// The page hands in its own copies of these; the fakes keep the assertions
// about the markup rather than about the helpers the page passes.
const escapeHtml = (text: string | number | boolean | undefined | null): string =>
    String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const formatString = (template: string, ...values: string[]): string =>
    template.replaceAll(/\{(\d+)\}/g, (match, digits: string) => values[Number(digits)] ?? match);

const EN = AGENDA_STRINGS.en;

/** Parses a fragment so structural claims are read off the DOM, like the page's. */
function parse(html: string): Document {
    return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}

suite('agendaNavHtml.renderModeSwitch', () => {
    const ctx = { modes: EN.modes, switchToView: EN.switchToView, escapeHtml, formatString };

    test('emits one button per view, in view order', () => {
        const buttons = [...parse(renderModeSwitch('day', ctx)).querySelectorAll('.seg-item')];
        assert.deepStrictEqual(
            buttons.map((b) => b.getAttribute('data-mode')),
            ['day', 'week', 'month', 'tasks']
        );
        assert.deepStrictEqual(
            buttons.map((b) => b.textContent),
            ['Day', 'Week', 'Month', 'Tasks']
        );
    });

    test('marks only the active view', () => {
        const active = [...parse(renderModeSwitch('month', ctx)).querySelectorAll('.seg-item.active')];
        assert.deepStrictEqual(
            active.map((b) => b.getAttribute('data-mode')),
            ['month']
        );
    });

    test('an unknown mode marks nothing rather than defaulting to Day', () => {
        assert.strictEqual(parse(renderModeSwitch('', ctx)).querySelectorAll('.seg-item.active').length, 0);
    });

    test('the tooltip names the view the button switches to', () => {
        const button = parse(renderModeSwitch('day', ctx)).querySelector('[data-mode="week"]');
        assert.strictEqual(button?.getAttribute('title'), 'Switch to Week view');
    });
});

suite('agendaNavHtml.tagLabel / tagButtonText', () => {
    test('the implicit ALL tag is shown translated, other names as configured', () => {
        assert.strictEqual(tagLabel('ALL', 'All'), 'All');
        assert.strictEqual(tagLabel('work', 'All'), 'work');
    });

    test('the collapsed button carries the caret', () => {
        assert.strictEqual(
            tagButtonText('work', { tagAll: 'All', tagButton: 'Tag: {0}', formatString }),
            'Tag: work ▾'
        );
    });
});

suite('agendaNavHtml.renderTagMenu', () => {
    const ctx = {
        tagAll: EN.tagAll,
        tagAllTitle: EN.tagAllTitle,
        tagButton: EN.tagButton,
        tagCaption: EN.tagCaption,
        tagFilterTitle: EN.tagFilterTitle,
        escapeHtml,
        formatString
    };

    test('lists every tag as a focusable button and marks the current one', () => {
        const rows = [...parse(renderTagMenu(['ALL', 'work', 'home'], 'work', ctx)).querySelectorAll('.tag-menu-item')];
        assert.deepStrictEqual(
            rows.map((r) => r.getAttribute('data-tag')),
            ['ALL', 'work', 'home']
        );
        assert.ok(
            rows.every((r) => r.tagName === 'BUTTON' && r.getAttribute('type') === 'button'),
            'rows must be real buttons so Tab and Enter reach them'
        );
        assert.deepStrictEqual(
            rows.filter((r) => r.classList.contains('active')).map((r) => r.getAttribute('data-tag')),
            ['work']
        );
    });

    test('the collapsed button shows the current tag', () => {
        const btn = parse(renderTagMenu(['ALL', 'work'], 'work', ctx)).querySelector('#tagMenuBtn');
        assert.strictEqual(btn?.textContent, 'Tag: work ▾');
    });

    test('ALL gets its own tooltip; a named tag gets the filter wording', () => {
        const doc = parse(renderTagMenu(['ALL', 'work'], 'ALL', ctx));
        assert.strictEqual(doc.querySelector('[data-tag="ALL"]')?.getAttribute('title'), EN.tagAllTitle);
        assert.strictEqual(
            doc.querySelector('[data-tag="work"]')?.getAttribute('title'),
            'Filter to files tagged work'
        );
    });

    test('a tag name with markup in it cannot break out of the attribute', () => {
        const doc = parse(renderTagMenu(['ALL', '"><script>x</script>'], 'ALL', ctx));
        assert.strictEqual(doc.querySelectorAll('script').length, 0);
        assert.strictEqual(doc.querySelectorAll('.tag-menu-item').length, 2);
    });
});

suite('agendaNavHtml.renderHeaderModeButton', () => {
    const ctx = {
        headerModeButton: EN.headerModeButton,
        headerModeTitle: EN.headerModeTitle,
        headerModes: EN.headerModes,
        escapeHtml,
        formatString,
        nextHeaderMode
    };

    test('names the current layout and what one click gives', () => {
        const btn = parse(renderHeaderModeButton('auto', ctx)).querySelector('#headerModeBtn');
        assert.ok(btn, 'expected the header-layout button');
        assert.strictEqual(btn.textContent, 'Header: Auto');
        assert.strictEqual(btn.getAttribute('title'), 'Agenda header: Auto (click for Full)');
    });

    test('the tooltip is repeated as aria-label so a screen reader gets it too', () => {
        const btn = parse(renderHeaderModeButton('compact', ctx)).querySelector('#headerModeBtn');
        assert.strictEqual(btn?.getAttribute('aria-label'), btn?.getAttribute('title'));
    });

    test('an unset or unknown setting reads as auto', () => {
        const expected = parse(renderHeaderModeButton('auto', ctx)).querySelector('#headerModeBtn')?.textContent;
        assert.strictEqual(
            parse(renderHeaderModeButton(undefined, ctx)).querySelector('#headerModeBtn')?.textContent,
            expected
        );
        assert.strictEqual(
            parse(renderHeaderModeButton('nonsense', ctx)).querySelector('#headerModeBtn')?.textContent,
            expected
        );
    });
});

suite('agendaNavHtml.renderDateNav', () => {
    const ctx = {
        navPrev: EN.navPrev,
        navNext: EN.navNext,
        navToday: EN.navToday,
        navTodayTitle: EN.navTodayTitle,
        escapeHtml
    };

    test('Prev/Today/Next in that order', () => {
        const buttons = [...parse(renderDateNav('day', ctx)).querySelectorAll('.nav-btn')];
        assert.deepStrictEqual(
            buttons.map((b) => b.getAttribute('id')),
            ['btn-prev', 'btn-today', 'btn-next']
        );
    });

    test('the wording follows the unit, not a shared template', () => {
        const title = (unit: 'day' | 'week' | 'month'): string | null | undefined =>
            parse(renderDateNav(unit, ctx)).querySelector('#btn-prev')?.getAttribute('title');
        assert.strictEqual(title('day'), 'Previous Day');
        assert.strictEqual(title('week'), 'Previous Week');
        assert.strictEqual(title('month'), 'Previous Month');
    });

    test('the Today button is labelled, the arrows are not', () => {
        const doc = parse(renderDateNav('week', ctx));
        assert.strictEqual(doc.querySelector('#btn-today')?.textContent, 'Today');
        assert.strictEqual(doc.querySelector('#btn-prev')?.textContent, '‹');
    });
});

suite('agendaNavHtml.renderHeroHtml', () => {
    test('a title alone gets no second line -- that is the Tasks view', () => {
        assert.strictEqual(renderHeroHtml({ title: 'Tasks' }, { escapeHtml }), '<div class="hero-title">Tasks</div>');
    });

    test('a subtitle renders as the second line', () => {
        const doc = parse(renderHeroHtml({ title: 'July', sub: '2026' }, { escapeHtml }));
        assert.strictEqual(doc.querySelector('.hero-title')?.textContent, 'July');
        assert.strictEqual(doc.querySelector('.hero-sub')?.textContent, '2026');
    });

    test('the TODAY badge shows only when one is given', () => {
        const withBadge = parse(
            renderHeroHtml({ title: 'Sunday', sub: '26 July 2026', badge: 'TODAY' }, { escapeHtml })
        );
        assert.strictEqual(withBadge.querySelector('.hero-badge')?.textContent, 'TODAY');
        const without = parse(renderHeroHtml({ title: 'Sunday', sub: '26 July 2026', badge: '' }, { escapeHtml }));
        assert.strictEqual(without.querySelector('.hero-badge'), null);
    });

    test('a badge without a subtitle still shows -- that is the month view', () => {
        // The month carries its year in the title, so the second line holds
        // nothing but the badge; without one there is no second line at all.
        const doc = parse(renderHeroHtml({ title: 'July 2026', badge: 'TODAY' }, { escapeHtml }));
        assert.strictEqual(doc.querySelector('.hero-title')?.textContent, 'July 2026');
        assert.strictEqual(doc.querySelector('.hero-sub')?.textContent, 'TODAY');
        assert.strictEqual(
            renderHeroHtml({ title: 'July 2026', badge: '' }, { escapeHtml }),
            '<div class="hero-title">July 2026</div>'
        );
    });

    test('the date text is escaped, not trusted', () => {
        const doc = parse(renderHeroHtml({ title: '<img>', sub: '<b>x</b>' }, { escapeHtml }));
        assert.strictEqual(doc.querySelectorAll('img, b').length, 0);
        assert.strictEqual(doc.querySelector('.hero-title')?.textContent, '<img>');
    });
});

suite('agendaNavHtml.renderNavBarHtml', () => {
    const parts = {
        modeSwitch: '<span class="mode-seg"></span>',
        dateNav: '<span class="date-nav"></span>',
        chips: '<button class="chip-btn"></button>'
    };

    test('the mode segment sits on its own row, the rest on the control row', () => {
        const doc = parse(renderNavBarHtml(parts));
        assert.ok(doc.querySelector('.seg-row > .mode-seg'), 'mode segment belongs to the seg row');
        assert.ok(doc.querySelector('.control-row > .date-nav'), 'date navigation belongs to the control row');
    });

    test('the spacer pushes the chips to the right edge', () => {
        const row = parse(renderNavBarHtml(parts)).querySelector('.control-row');
        assert.deepStrictEqual(
            [...(row?.children ?? [])].map((el) => el.className),
            ['date-nav', 'nav-spacer', 'chip-btn']
        );
    });

    test('the Tasks view drops the date navigation without leaving a gap', () => {
        const row = parse(renderNavBarHtml({ ...parts, dateNav: '' })).querySelector('.control-row');
        assert.deepStrictEqual(
            [...(row?.children ?? [])].map((el) => el.className),
            ['nav-spacer', 'chip-btn']
        );
    });
});
