import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { renderGroupMenu } from '../../utils/agendaGroupMenuHtml';
import { escapeHtml } from '../../utils/agendaEscapeHtml';
import { formatString } from '../../utils/agendaI18n';

const strings = {
    menuTitle: 'Act on “{0}”',
    moveToToday: 'Move to today',
    dropPlanning: 'Drop the date',
    cancel: 'Mark cancelled',
    moveToTodayHint: 'Date every entry today',
    dropPlanningHint: 'Take the date off',
    cancelHint: 'Write the keyword'
};

const ctx = { strings, escapeHtml, formatString };

suite('agendaGroupMenuHtml.renderGroupMenu', () => {
    test('carries the band key, so the host can rebuild the group', () => {
        const html = renderGroupMenu('overdue-recent', 'Overdue this week', ctx);
        assert.match(html, /<div class="group-menu" data-section="overdue-recent">/);
    });

    test('offers the three actions, each with its own hint', () => {
        const html = renderGroupMenu('overdue-long', 'Overdue long ago', ctx);
        assert.match(html, /data-action="move-to-today" title="Date every entry today">Move to today</);
        assert.match(html, /data-action="drop-planning" title="Take the date off">Drop the date</);
        assert.match(html, /data-action="cancel" title="Write the keyword">Mark cancelled</);
    });

    test('the mark names the band it acts on', () => {
        const html = renderGroupMenu('overdue-repeat', 'Missed repeats', ctx);
        assert.match(html, /<button type="button" class="group-menu-btn" title="Act on “Missed repeats”">⋮<\/button>/);
    });

    test('the week view adds the day, the day view leaves it out', () => {
        // Without the date, seven identical band keys reach the host and the
        // first day of the payload answers for all of them.
        assert.match(
            renderGroupMenu('overdue-recent', 'Overdue this week', ctx, '2026-08-12'),
            /data-section="overdue-recent" data-date="2026-08-12">/
        );
        assert.ok(!renderGroupMenu('overdue-recent', 'Overdue this week', ctx).includes('data-date'));
    });

    test('escapes a band title that carries markup', () => {
        const html = renderGroupMenu('overdue-recent', '<script>', ctx);
        assert.match(html, /&lt;script&gt;/);
        assert.ok(!html.includes('<script>'), `expected the title to be escaped, got: ${html}`);
    });
});
