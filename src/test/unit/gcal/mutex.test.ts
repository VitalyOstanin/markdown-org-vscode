import * as assert from 'node:assert/strict';
import { SingleFlight, type RunHandle } from '../../../utils/gcal/mutex';

function deferred(): { p: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const p = new Promise<void>((r) => {
        resolve = r;
    });
    return { p, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

suite('gcal/mutex', () => {
    test('queue coalesces multiple requests into a single rerun', async () => {
        const sf = new SingleFlight('queue');
        let starts = 0;
        const gates: ReturnType<typeof deferred>[] = [];
        const task = async () => {
            starts++;
            const d = deferred();
            gates.push(d);
            await d.p;
        };

        const p = sf.run(task); // run #1
        await tick();
        assert.equal(starts, 1);
        void sf.run(task); // pending
        void sf.run(task); // coalesced, still one pending
        gates[0].resolve(); // finish #1 -> rerun #2
        await tick();
        assert.equal(starts, 2);
        gates[1].resolve(); // finish #2, no pending
        await p;
        assert.equal(starts, 2);
    });

    test('cancel aborts the in-flight run and reruns once', async () => {
        const sf = new SingleFlight('cancel');
        let starts = 0;
        const handles: RunHandle[] = [];
        const gates: ReturnType<typeof deferred>[] = [];
        const task = async (signal: RunHandle) => {
            starts++;
            handles.push(signal);
            const d = deferred();
            gates.push(d);
            await d.p;
        };

        const p = sf.run(task); // run #1
        await tick();
        void sf.run(task); // cancel: abort #1, schedule rerun
        assert.equal(handles[0].aborted, true);
        gates[0].resolve(); // #1 returns -> rerun #2
        await tick();
        assert.equal(starts, 2);
        assert.equal(handles[1].aborted, false);
        gates[1].resolve();
        await p;
    });
});
