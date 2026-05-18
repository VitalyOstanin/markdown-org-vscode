import * as assert from 'assert';
import { suite, test } from 'mocha';
import { resolveAgendaWatchBase } from '../../utils/agendaWatchPattern';

suite('agendaWatchPattern.resolveAgendaWatchBase', () => {
    test('prefers an explicit markdown-org.workspaceDir over the workspace folder', () => {
        // Matches the precedence in commands/agenda.ts loadData: an explicit
        // configured dir wins over the first workspace folder. The watcher
        // must scope to the same directory or the agenda will refresh on
        // unrelated changes that loadData would not pick up.
        assert.strictEqual(resolveAgendaWatchBase('/abs/org', '/abs/workspace'), '/abs/org');
    });

    test('falls back to the workspace folder when no workspaceDir is configured', () => {
        assert.strictEqual(resolveAgendaWatchBase(undefined, '/abs/workspace'), '/abs/workspace');
    });

    test('falls back to the workspace folder when workspaceDir is the empty string', () => {
        // Configuration default is '' rather than undefined when the user has
        // explicitly cleared the setting. Treat that as "not configured".
        assert.strictEqual(resolveAgendaWatchBase('', '/abs/workspace'), '/abs/workspace');
    });

    test('returns undefined when neither a configured dir nor a workspace folder is available', () => {
        // In practice the caller should not even reach this branch (the agenda
        // command bails earlier), but the helper still has a defined contract.
        assert.strictEqual(resolveAgendaWatchBase(undefined, undefined), undefined);
        assert.strictEqual(resolveAgendaWatchBase('', undefined), undefined);
    });
});
