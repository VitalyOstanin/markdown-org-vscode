import * as assert from 'node:assert/strict';
import { busctlCall, gdbusGetAccessToken, BusctlMissingError, type DbusRun } from '../../../utils/gcal/dbus';

function fakeRun(result: { stdout?: string; stderr?: string; code?: number | string }): DbusRun {
    return async () => ({ stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.code ?? 0 });
}

suite('gcal/dbus', () => {
    test('busctlCall returns parsed .data array', async () => {
        const run = fakeRun({ stdout: JSON.stringify({ type: '(si)', data: ['tok', 3599] }) });
        const data = await busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' });
        assert.deepEqual(data, ['tok', 3599]);
    });

    test('busctlCall throws on non-zero exit', async () => {
        const run = fakeRun({ code: 1, stderr: 'boom' });
        await assert.rejects(
            () => busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' }),
            /busctl GetAccessToken failed: boom/
        );
    });

    test('busctlCall throws BusctlMissingError on ENOENT', async () => {
        const run = fakeRun({ code: 'ENOENT', stderr: '' });
        await assert.rejects(
            () => busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' }),
            BusctlMissingError
        );
    });

    test('busctlCall reports the exit code when the command says nothing', async () => {
        // A tool that fails silently still has to name a reason: without the
        // code the message reads "busctl GetAccessToken failed:" and the user
        // is left with nothing to look up.
        const run = fakeRun({ code: 3, stderr: '   ' });
        await assert.rejects(
            () => busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' }),
            /busctl GetAccessToken failed: exit 3/
        );
    });

    test('busctlCall refuses output that is not JSON', async () => {
        const run = fakeRun({ stdout: 'not json' });
        await assert.rejects(
            () => busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' }),
            /unexpected output/
        );
    });

    test('busctlCall refuses JSON that carries no data array', async () => {
        // The token is read out of `data` by position. An object there would
        // index as `undefined` and travel on as an empty token.
        const run = fakeRun({ stdout: JSON.stringify({ type: '(si)', data: { token: 'tok' } }) });
        await assert.rejects(
            () => busctlCall(run, { objectPath: '/p', iface: 'i', method: 'GetAccessToken' }),
            /unexpected output/
        );
    });

    test('gdbusGetAccessToken reports a failed call rather than parsing its output', async () => {
        const run = fakeRun({ code: 1, stderr: 'no such account' });
        await assert.rejects(() => gdbusGetAccessToken(run, '/acc'), /gdbus GetAccessToken failed: no such account/);
    });

    test('gdbusGetAccessToken parses a GVariant tuple', async () => {
        const run = fakeRun({ stdout: "('ya29.abc-DEF_123', 3599)\n" });
        const [tok, exp] = await gdbusGetAccessToken(run, '/acc');
        assert.equal(tok, 'ya29.abc-DEF_123');
        assert.equal(exp, 3599);
    });

    test('gdbusGetAccessToken throws on unparseable output', async () => {
        const run = fakeRun({ stdout: 'nonsense' });
        await assert.rejects(() => gdbusGetAccessToken(run, '/acc'), /unexpected output/);
    });
});
