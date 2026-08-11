import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    countLabel,
    renderDayHeaderHtml,
    renderSectionPanel,
    renderSummaryBar,
    summaryStat
} from '../../utils/agendaSummaryHtml';

// The page passes its own copies of these; the fakes here keep the assertions
// about the markup rather than about the helpers it is handed.
const escapeHtml = (text: string | number | boolean | undefined | null): string =>
    String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const formatString = (template: string, ...values: string[]): string =>
    template.replaceAll(/\{(\d+)\}/g, (match, digits: string) => values[Number(digits)] ?? match);
const formatNumber = (n: number, locale: string): string => (locale === 'ar-EG' ? `«${n}»` : String(n));
// English rules are enough to prove the form is chosen by count, not hardcoded.
const pluralIndex = (n: number): number => (n === 1 ? 0 : 1);

const base = { locale: 'en-US', uiLang: 'en', escapeHtml, formatString, formatNumber, pluralIndex };

suite('agendaSummaryHtml.countLabel', () => {
    test('picks the plural form by count', () => {
        assert.strictEqual(countLabel(1, ['task', 'tasks'], base), '1 task');
        assert.strictEqual(countLabel(3, ['task', 'tasks'], base), '3 tasks');
    });

    test('the digits follow the date locale, the word follows the UI language', () => {
        assert.strictEqual(countLabel(3, ['task', 'tasks'], { ...base, locale: 'ar-EG' }), '«3» tasks');
    });

    test('a missing form leaves the number alone rather than printing undefined', () => {
        assert.strictEqual(countLabel(3, ['task'], base), '3 ');
    });
});

suite('agendaSummaryHtml.summaryStat', () => {
    test('renders the count in bold with its qualifier', () => {
        assert.strictEqual(
            summaryStat(2, 'overdue', '', base),
            '<span class="day-summary-stat"><b>2</b> overdue</span>'
        );
    });

    test('appends the modifier class when given one', () => {
        assert.match(summaryStat(2, 'overdue', 'day-summary-overdue', base), /class="day-summary-stat day-summary-o/);
    });

    test('accepts plural forms and picks by count', () => {
        assert.match(summaryStat(1, ['task', 'tasks'], '', base), /<\/b> task<\/span>/);
        assert.match(summaryStat(5, ['task', 'tasks'], '', base), /<\/b> tasks<\/span>/);
    });

    test('escapes the label', () => {
        assert.match(summaryStat(1, '<b>x</b>', '', base), /&lt;b&gt;x&lt;\/b&gt;/);
    });

    test('the digits follow the date locale, as they do everywhere else on the screen', () => {
        // The day header and the month grid go through `formatNumber`; a
        // summary that printed the raw number put Latin digits next to
        // Arabic-Indic ones on the same screen.
        assert.match(summaryStat(3, 'overdue', '', { ...base, locale: 'ar-EG' }), /<b>«3»<\/b>/);
    });
});

suite('agendaSummaryHtml.renderSummaryBar', () => {
    test('carries the anchor date as data-date', () => {
        assert.match(renderSummaryBar('2026-07-26', ['<span>a</span>'], base), /data-date="2026-07-26"/);
    });

    test('emits no data-date for the date-less tasks view', () => {
        const html = renderSummaryBar('', ['<span>a</span>'], base);
        assert.ok(!html.includes('data-date'), `expected no data-date attribute, got: ${html}`);
    });

    test('separates the pieces with the middle dot', () => {
        const html = renderSummaryBar('', ['<i>a</i>', '<i>b</i>'], base);
        assert.strictEqual(
            html,
            '<div class="day-header day-summary"><i>a</i><span class="day-summary-sep">·</span><i>b</i></div>'
        );
    });
});

suite('agendaSummaryHtml.renderSectionPanel', () => {
    const ctx = { ...base, inSectionTemplate: '{0} in this section', taskForms: ['task', 'tasks'] };

    test('renders the title, the count chip and the rows', () => {
        const html = renderSectionPanel('overdue', 'Overdue', 2, '<div class="task-line"></div>', ctx, '');
        assert.match(html, /<section class="day-section day-section-overdue">/);
        assert.match(html, /<span class="day-section-name">Overdue<\/span>/);
        assert.match(html, /<span class="day-section-count" title="2 tasks in this section">2<\/span>/);
        assert.match(html, /<div class="day-section-body"><div class="task-line"><\/div><\/div>/);
    });

    test('the chip title counts in the UI language, singular included', () => {
        assert.match(renderSectionPanel('p1', 'A', 1, '', ctx, ''), /title="1 task in this section"/);
    });

    test('escapes the section title', () => {
        assert.match(renderSectionPanel('x', '<script>', 0, '', ctx, ''), /&lt;script&gt;/);
    });

    test('the chip and its tooltip use the same digits', () => {
        // Both say the same number; one of them going through `formatNumber`
        // and the other not made the element disagree with itself.
        const html = renderSectionPanel('p1', 'A', 3, '', { ...ctx, locale: 'ar-EG' }, '');
        assert.match(html, /<span class="day-section-count" title="«3» tasks in this section">«3»<\/span>/, html);
    });

    test('puts the head actions after the count chip, inside the head', () => {
        const html = renderSectionPanel('overdue-recent', 'Overdue', 1, '', ctx, '<button class="group-menu-btn" />');
        assert.match(html, /<span class="day-section-count"[^>]*>1<\/span><button class="group-menu-btn" \/><\/div>/);
    });
});

suite('agendaSummaryHtml.renderDayHeaderHtml', () => {
    test('splits the header into weekday, day number and month-year', () => {
        assert.strictEqual(
            renderDayHeaderHtml({ weekday: 'Sunday', day: '26', month: 'July', year: '2026' }),
            '<span class="day-weekday">Sunday</span><span class="day-num">26</span>' +
                '<span class="day-rest">July 2026</span>'
        );
    });

    test('passes non-Latin digits through unchanged', () => {
        assert.match(renderDayHeaderHtml({ weekday: 'الأحد', day: '٢٦', month: 'يوليو', year: '٢٠٢٦' }), /٢٦/);
    });
});
