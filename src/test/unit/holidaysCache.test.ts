import * as assert from 'assert';
import { DEFAULT_HOLIDAYS_TTL_MS, clearHolidaysCache, getCachedHolidays } from '../../utils/holidaysCache';

suite('holidaysCache', () => {
    setup(() => {
        clearHolidaysCache();
    });

    teardown(() => {
        clearHolidaysCache();
    });

    test('first call invokes the fetcher and returns its result', async () => {
        let calls = 0;
        const fetcher = async (year: number) => {
            calls++;
            return [`${year}-01-01`];
        };

        const result = await getCachedHolidays(2026, fetcher, () => 0);

        assert.deepStrictEqual(result, ['2026-01-01']);
        assert.strictEqual(calls, 1);
    });

    test('subsequent call within TTL hits the cache and skips the fetcher', async () => {
        let calls = 0;
        const fetcher = async () => {
            calls++;
            return ['2026-01-01'];
        };

        await getCachedHolidays(2026, fetcher, () => 0);
        const result = await getCachedHolidays(2026, fetcher, () => 1000);

        assert.deepStrictEqual(result, ['2026-01-01']);
        assert.strictEqual(calls, 1);
    });

    test('call after TTL expiry re-invokes the fetcher', async () => {
        let calls = 0;
        const fetcher = async () => {
            calls++;
            return [`call-${calls}`];
        };

        const ttl = 1000;
        await getCachedHolidays(2026, fetcher, () => 0, ttl);
        const result = await getCachedHolidays(2026, fetcher, () => ttl + 1, ttl);

        assert.deepStrictEqual(result, ['call-2']);
        assert.strictEqual(calls, 2);
    });

    test('different years are cached independently', async () => {
        const fetcher = async (year: number) => [`${year}-01-01`];

        const r2026 = await getCachedHolidays(2026, fetcher, () => 0);
        const r2027 = await getCachedHolidays(2027, fetcher, () => 0);

        assert.deepStrictEqual(r2026, ['2026-01-01']);
        assert.deepStrictEqual(r2027, ['2027-01-01']);
    });

    test('fetcher rejection is not cached and the next call retries', async () => {
        let calls = 0;
        const fetcher = async () => {
            calls++;
            if (calls === 1) {
                throw new Error('boom');
            }
            return ['ok'];
        };

        await assert.rejects(() => getCachedHolidays(2026, fetcher, () => 0));
        const result = await getCachedHolidays(2026, fetcher, () => 0);

        assert.deepStrictEqual(result, ['ok']);
        assert.strictEqual(calls, 2);
    });

    test('clearHolidaysCache forces the next call to re-invoke the fetcher', async () => {
        let calls = 0;
        const fetcher = async () => {
            calls++;
            return ['x'];
        };

        await getCachedHolidays(2026, fetcher, () => 0);
        clearHolidaysCache();
        await getCachedHolidays(2026, fetcher, () => 0);

        assert.strictEqual(calls, 2);
    });

    test('default TTL is one hour', () => {
        assert.strictEqual(DEFAULT_HOLIDAYS_TTL_MS, 60 * 60 * 1000);
    });
});
