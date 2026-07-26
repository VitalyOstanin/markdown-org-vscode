import * as assert from 'assert';
import { suite, test } from 'mocha';
import { resolveHeroModel } from '../../utils/agendaHero';

suite('resolveHeroModel', () => {
    test('tasks mode: static Tasks title, never shows the TODAY badge', () => {
        assert.deepStrictEqual(resolveHeroModel('tasks', '2025-12-09', '2025-12-09'), {
            kind: 'tasks',
            showToday: false
        });
    });

    test('day mode on today: date kind with the TODAY badge', () => {
        assert.deepStrictEqual(resolveHeroModel('day', '2025-12-09', '2025-12-09'), {
            kind: 'date',
            showToday: true
        });
    });

    test('day mode navigated away: date kind, no badge', () => {
        assert.deepStrictEqual(resolveHeroModel('day', '2025-12-12', '2025-12-09'), {
            kind: 'date',
            showToday: false
        });
    });

    test('week mode anchored on today: date kind with the badge', () => {
        assert.deepStrictEqual(resolveHeroModel('week', '2025-12-09', '2025-12-09'), {
            kind: 'date',
            showToday: true
        });
    });

    test('month mode within the current month: month kind with the badge', () => {
        // Anchor is a different DAY but the same month -> still "today's month".
        assert.deepStrictEqual(resolveHeroModel('month', '2025-12-01', '2025-12-09'), {
            kind: 'month',
            showToday: true
        });
    });

    test('month mode in another month: month kind, no badge', () => {
        assert.deepStrictEqual(resolveHeroModel('month', '2026-01-09', '2025-12-09'), {
            kind: 'month',
            showToday: false
        });
    });

    test('month badge ignores the day-of-month, compares only YYYY-MM', () => {
        assert.strictEqual(resolveHeroModel('month', '2025-12-31', '2025-12-01').showToday, true);
    });

    test('unknown mode falls back to exact-day date comparison', () => {
        assert.deepStrictEqual(resolveHeroModel('something', '2025-12-09', '2025-12-09'), {
            kind: 'date',
            showToday: true
        });
    });
});
