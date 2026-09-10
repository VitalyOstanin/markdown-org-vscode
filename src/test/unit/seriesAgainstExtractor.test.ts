import * as assert from 'node:assert/strict';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'mocha';
import { fromIsoDate, toIsoDate } from '../../utils/isoDate';
import { listOccurrences, seriesFallsOn } from '../../utils/occurrenceEdit';
import { findBundledBinary } from '../../utils/bundledBinary';

/**
 * The days a series falls on, counted here against the days the agenda draws.
 *
 * Both sides answer the same question and neither reads the other: the panel
 * offers occurrences out of `listOccurrences`, the `MOVED` rule refuses a day
 * with `seriesFallsOn`, and the agenda itself is drawn from what the extractor
 * says. When the two counts drift the failure is quiet -- the reader is
 * offered a day the agenda has nothing on, and the diagnostic reports a line
 * the extractor accepts.
 *
 * They did drift. Counting by stepping from the previous occurrence loses a
 * day the calendar has to shorten: from January 31st a step reached February
 * 28th and then March 28th, while the extractor adds whole periods to the base
 * and truncates only for the month it lands in, so its series is on March 31st
 * (#229). A year is walked differently again -- whole years, keeping only
 * those that have the day the series is written on -- so February 29th repeats
 * every fourth year rather than standing on the 28th in between.
 *
 * Skipped when the binary is not there: it is downloaded into `bin/` by the
 * build, and the unit suite has to run without it.
 */
const BINARY = findBundledBinary(path.join(__dirname, '..', '..', '..'), process.platform);

interface AgendaDay {
    date: string;
    scheduled_timed: unknown[];
    scheduled_no_time: unknown[];
}

/** The days of `[from, to]` the extractor puts the entry on. */
function extractorDays(base: string, repeater: string, from: string, to: string): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-series-'));
    try {
        fs.writeFileSync(path.join(dir, 'notes.md'), `## Item\n\n\`SCHEDULED: <${base} Mon ${repeater}>\`\n`, 'utf8');
        const out = cp.execFileSync(
            BINARY ?? '',
            ['--dir', dir, '--agenda', 'week', '--from', from, '--to', to, '--quiet'],
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
        );
        return (JSON.parse(out) as AgendaDay[])
            .filter((day) => day.scheduled_timed.length + day.scheduled_no_time.length > 0)
            .map((day) => day.date);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

/** Every day of `[from, to]`, so the "not an occurrence" side is checked too. */
function everyDay(from: string, to: string): string[] {
    const days: string[] = [];
    for (const day = fromIsoDate(from); toIsoDate(day) <= to; day.setDate(day.getDate() + 1)) {
        days.push(toIsoDate(day));
    }
    return days;
}

/** The edges a repeater is counted at: month ends, a leap day, and the plain cases. */
const SERIES: readonly (readonly [string, string])[] = [
    ['2026-01-31', '+1m'],
    ['2026-01-30', '+1m'],
    ['2026-03-31', '+1m'],
    ['2026-02-28', '+1m'],
    ['2026-12-31', '+1m'],
    ['2026-01-31', '+2m'],
    ['2026-05-15', '+6m'],
    ['2024-02-29', '+1y'],
    ['2024-02-29', '+2y'],
    ['2024-03-01', '+1y'],
    ['2026-08-06', '+1w'],
    ['2026-08-31', '+1w'],
    ['2026-08-06', '+3d']
];

suite('the days a series falls on, against the extractor', function () {
    // A process per series; the default 2s is not enough for thirteen of them.
    this.timeout(60_000);

    const available = BINARY !== undefined;

    for (const [base, repeater] of SERIES) {
        test(`${base} ${repeater} falls on the days the agenda draws`, function () {
            if (!available) {
                this.skip();
            }
            const lines = ['## Item', `\`SCHEDULED: <${base} Mon ${repeater}>\``, ''];
            const offered = listOccurrences(lines, 0, 'Item', fromIsoDate(base), 12).map((day) => day.day);
            const last = offered.at(-1) ?? base;
            const drawn = extractorDays(base, repeater, base, last);

            assert.deepEqual(offered, drawn, 'the occurrences offered are the days the agenda draws');

            // And the other side of the same answer: every day in between that
            // the extractor leaves empty has to be refused here.
            // As the `MOVED` rule reads it: the timestamp alone, brackets and all.
            const timestamp = `<${base} Mon ${repeater}>`;
            const drawnDays = new Set(drawn);
            for (const day of everyDay(base, last)) {
                assert.equal(seriesFallsOn(timestamp, day), drawnDays.has(day), `${day} of ${base} ${repeater}`);
            }
        });
    }
});
