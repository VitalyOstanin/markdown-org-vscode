import * as assert from 'node:assert';
import { suite, test, setup, teardown } from 'mocha';
import * as sinon from 'sinon';
import { exec } from '../../utils/exec';
import { isMicrophoneMuted } from '../../utils/microphone';
import type { ExecFileCallback } from '../_execFake';

/**
 * The mixer is asked one question and its answer is read one way, so what is
 * worth testing is the reading: a muted input says so, and everything that is
 * not that answer must not be taken for one. A machine without `pactl` is the
 * common case rather than the exotic one — every Windows and macOS run of this
 * suite is one — and a reminder shown there would stand on every phrase.
 */
suite('microphone', () => {
    let execFileStub: sinon.SinonStub;

    /** Make the mixer answer with `stdout`, or fail with `error`. */
    function answers(stdout: string, error: Error | null = null) {
        execFileStub.callsFake((..._args: unknown[]) => {
            const callback = _args.at(-1) as ExecFileCallback;
            callback(error, stdout, '');
        });
    }

    setup(() => {
        execFileStub = sinon.stub(exec, 'execFile');
    });

    teardown(() => {
        execFileStub.restore();
    });

    test('a muted input is reported as muted', async () => {
        answers('Mute: yes\n');
        assert.strictEqual(await isMicrophoneMuted(), true);
    });

    test('an input that is on is not', async () => {
        answers('Mute: no\n');
        assert.strictEqual(await isMicrophoneMuted(), false);
    });

    test('a machine with no pactl is not called muted', async () => {
        answers('', new Error('spawn pactl ENOENT'));
        assert.strictEqual(await isMicrophoneMuted(), false);
    });

    test('an answer in a shape this does not know is not called muted', async () => {
        answers('Ошибка: нет такого источника\n');
        assert.strictEqual(await isMicrophoneMuted(), false);
    });

    test('a mixer call that cannot even start is not called muted', async () => {
        // `execFile` throws rather than calling back when the process cannot be
        // spawned at all. Left to propagate, the phrase command would end on an
        // unhandled rejection instead of writing the entry.
        execFileStub.throws(new Error('EMFILE: too many open files'));
        assert.strictEqual(await isMicrophoneMuted(), false);
    });

    test('the default source is the one asked about', async () => {
        answers('Mute: no\n');
        await isMicrophoneMuted();

        const call = execFileStub.getCall(0);
        assert.strictEqual(call.args[0], 'pactl');
        assert.deepStrictEqual(call.args[1], ['get-source-mute', '@DEFAULT_SOURCE@']);
    });

    test('the question is given a deadline, so a stalled mixer does not hold the box', async () => {
        answers('Mute: no\n');
        await isMicrophoneMuted();

        const options = execFileStub.getCall(0).args[2] as { timeout?: number };
        assert.ok(options.timeout && options.timeout > 0, 'expected a timeout on the mixer call');
    });
});
