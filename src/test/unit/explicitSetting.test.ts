import * as assert from 'assert';
import { suite, test } from 'mocha';
import { explicitSettingValue } from '../../utils/explicitSetting';

suite('explicitSettingValue', () => {
    test('an untouched setting reads as unset, not as its default', () => {
        // This is the whole point: `get()` would answer "en-US" here.
        assert.strictEqual(explicitSettingValue({}), undefined);
        assert.strictEqual(explicitSettingValue(undefined), undefined);
    });

    test('the most specific scope the user set wins', () => {
        assert.strictEqual(explicitSettingValue({ globalValue: 'en-US' }), 'en-US');
        assert.strictEqual(explicitSettingValue({ globalValue: 'en-US', workspaceValue: 'ru-RU' }), 'ru-RU');
        assert.strictEqual(
            explicitSettingValue({ globalValue: 'en-US', workspaceValue: 'ru-RU', workspaceFolderValue: 'de-DE' }),
            'de-DE'
        );
    });

    test('an explicitly set empty string is a value, not an absence', () => {
        assert.strictEqual(explicitSettingValue({ workspaceValue: '' }), '');
    });
});
