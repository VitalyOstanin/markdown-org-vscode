import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { nextGrouping, normalizeGrouping } from '../../utils/agendaGrouping';

/**
 * The setting that decides whether a day announces its sections. It arrives as
 * a free string from the settings file, and two callers -- the panel and the
 * palette command -- have to read it the same way.
 */
suite('agendaGrouping', () => {
    test('only "flat" turns the headings off', () => {
        assert.equal(normalizeGrouping('flat'), 'flat');
        assert.equal(normalizeGrouping('sections'), 'sections');
    });

    test('anything unexpected is the day with its headings', () => {
        // A typo in the settings file, or a value from a version that knew a
        // third grouping: the readable answer is the default, not an empty day.
        assert.equal(normalizeGrouping('Flat'), 'sections');
        assert.equal(normalizeGrouping(''), 'sections');
        assert.equal(normalizeGrouping(undefined), 'sections');
    });

    test('the command steps between the two and comes back', () => {
        assert.equal(nextGrouping('sections'), 'flat');
        assert.equal(nextGrouping('flat'), 'sections');
        assert.equal(nextGrouping(undefined), 'flat', 'the default steps to the other one');
        assert.equal(nextGrouping('nonsense'), 'flat');
    });
});
