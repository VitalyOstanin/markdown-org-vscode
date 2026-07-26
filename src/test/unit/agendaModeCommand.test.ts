import * as assert from 'node:assert';
import { suite, test } from 'mocha';
import { agendaModeCommand } from '../../utils/agendaModeCommand';

suite('agendaModeCommand', () => {
    test('maps each agenda mode to the command that opens it', () => {
        assert.strictEqual(agendaModeCommand('day'), 'markdown-org.showAgendaDay');
        assert.strictEqual(agendaModeCommand('week'), 'markdown-org.showAgendaWeek');
        assert.strictEqual(agendaModeCommand('month'), 'markdown-org.showAgendaMonth');
        assert.strictEqual(agendaModeCommand('tasks'), 'markdown-org.showTasks');
    });

    test('returns undefined for an unknown, empty or nullish mode', () => {
        // Both callers treat "no command" as "do nothing", so an unknown mode
        // must never resolve to some other view.
        assert.strictEqual(agendaModeCommand('agenda'), undefined);
        assert.strictEqual(agendaModeCommand(''), undefined);
        assert.strictEqual(agendaModeCommand(undefined), undefined);
        assert.strictEqual(agendaModeCommand(null), undefined);
    });

    test('does not inherit Object.prototype members as modes', () => {
        assert.strictEqual(agendaModeCommand('toString'), undefined);
        assert.strictEqual(agendaModeCommand('constructor'), undefined);
    });
});
