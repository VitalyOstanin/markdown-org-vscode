#!/usr/bin/env node
'use strict';

// Coverage gate for a run whose report only exists as lcov.
//
// The unit run is gated by c8 itself (`check-coverage` in .c8rc.json), which
// works off c8's own V8 output. The integration run is driven by
// @vscode/test-cli: it collects V8 coverage inside the Extension Host and emits
// lcov, with no threshold option anywhere in the chain. Without a gate the
// layer that covers the panel and the commands -- the bulk of the code -- could
// regress silently. This script parses the emitted lcov and fails when a metric
// drops below its floor.
//
// Usage:
//   node scripts/check-lcov-thresholds.js <lcov file> --lines=N --functions=N --branches=N
//
// Metrics not passed are not checked. A file with no branches at all reports
// 100% for branches, matching how c8 treats an empty denominator.

const fs = require('node:fs');

function parseArgs(argv) {
    const file = argv.find((a) => !a.startsWith('--'));
    const thresholds = {};
    for (const arg of argv) {
        const m = /^--(lines|functions|branches)=(\d+(?:\.\d+)?)$/.exec(arg);
        if (m) {
            thresholds[m[1]] = Number(m[2]);
        }
    }
    return { file, thresholds };
}

// lcov counters: LF/LH lines found/hit, FNF/FNH functions, BRF/BRH branches.
function summarise(lcov) {
    const totals = { lines: [0, 0], functions: [0, 0], branches: [0, 0] };
    const keys = {
        LF: ['lines', 0],
        LH: ['lines', 1],
        FNF: ['functions', 0],
        FNH: ['functions', 1],
        BRF: ['branches', 0],
        BRH: ['branches', 1]
    };
    for (const line of lcov.split('\n')) {
        const [tag, value] = line.trim().split(':');
        const target = keys[tag];
        if (target) {
            totals[target[0]][target[1]] += Number(value) || 0;
        }
    }
    const pct = ([found, hit]) => (found === 0 ? 100 : (hit / found) * 100);
    return {
        lines: pct(totals.lines),
        functions: pct(totals.functions),
        branches: pct(totals.branches),
        totals
    };
}

function main() {
    const { file, thresholds } = parseArgs(process.argv.slice(2));
    if (!file) {
        console.error('usage: check-lcov-thresholds.js <lcov file> [--lines=N] [--functions=N] [--branches=N]');
        process.exit(2);
    }
    if (!fs.existsSync(file)) {
        console.error(`[check-lcov-thresholds] report not found: ${file}`);
        process.exit(2);
    }
    const summary = summarise(fs.readFileSync(file, 'utf8'));
    let failed = false;
    for (const [metric, floor] of Object.entries(thresholds)) {
        const actual = summary[metric];
        const [found, hit] = summary.totals[metric];
        const line = `${metric}: ${actual.toFixed(2)}% (${hit}/${found}), floor ${floor}%`;
        if (actual + 1e-9 < floor) {
            console.error(`[check-lcov-thresholds] FAIL ${line}`);
            failed = true;
        } else {
            console.log(`[check-lcov-thresholds] ok   ${line}`);
        }
    }
    process.exit(failed ? 1 : 0);
}

main();
