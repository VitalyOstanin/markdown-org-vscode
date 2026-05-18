import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { notifyError, notifyInfo, notifyWarn } from '../../utils/notify';

const ORG_PREFIX = 'Markdown Org: ';

suite('notify helpers', () => {
    let errorStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;
    let infoStub: sinon.SinonStub;

    setup(() => {
        errorStub = sinon.stub(vscode.window, 'showErrorMessage');
        warnStub = sinon.stub(vscode.window, 'showWarningMessage');
        infoStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    teardown(() => {
        errorStub.restore();
        warnStub.restore();
        infoStub.restore();
    });

    test('notifyError prepends the Markdown Org prefix and routes to showErrorMessage', () => {
        notifyError('No active editor');

        assert.strictEqual(errorStub.callCount, 1);
        assert.strictEqual(errorStub.firstCall.args[0], `${ORG_PREFIX}No active editor`);
        assert.strictEqual(warnStub.callCount, 0);
        assert.strictEqual(infoStub.callCount, 0);
    });

    test('notifyWarn prepends the Markdown Org prefix and routes to showWarningMessage', () => {
        notifyWarn('agenda is disabled in untrusted workspaces');

        assert.strictEqual(warnStub.callCount, 1);
        assert.strictEqual(warnStub.firstCall.args[0], `${ORG_PREFIX}agenda is disabled in untrusted workspaces`);
        assert.strictEqual(errorStub.callCount, 0);
        assert.strictEqual(infoStub.callCount, 0);
    });

    test('notifyInfo prepends the Markdown Org prefix and routes to showInformationMessage', () => {
        notifyInfo('Tag filter: WORK');

        assert.strictEqual(infoStub.callCount, 1);
        assert.strictEqual(infoStub.firstCall.args[0], `${ORG_PREFIX}Tag filter: WORK`);
        assert.strictEqual(errorStub.callCount, 0);
        assert.strictEqual(warnStub.callCount, 0);
    });

    test('the prefix is added only once (caller must not pre-prepend it)', () => {
        // Regression guard: when notify was introduced we deleted inline
        // "Markdown Org: " prefixes from every call site; if anyone re-adds
        // one, the resulting message would say "Markdown Org: Markdown Org: ...".
        notifyError('something broke');

        assert.strictEqual(errorStub.firstCall.args[0], 'Markdown Org: something broke');
        assert.ok(!errorStub.firstCall.args[0].startsWith('Markdown Org: Markdown Org: '));
    });
});
