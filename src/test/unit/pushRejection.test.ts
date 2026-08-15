import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { isPushRejected } from '../../utils/git/pushRejection';

/**
 * Both ways a refused push announces itself. Against a real host only one of
 * them is ever exercised -- whichever that host emits -- and the outcome looks
 * the same either way, so the branch that is not taken there is checked here.
 */
suite('isPushRejected', () => {
    test('the error code the Git extension attaches', () => {
        assert.equal(isPushRejected({ gitErrorCode: 'PushRejected', message: 'push failed' }), true);
    });

    test('the refusal in the captured stderr, with no code on the error', () => {
        // The older host, and the remote whose own hook refuses the update:
        // git prints the refusal and the extension passes stderr along.
        const error = Object.assign(new Error('Failed to execute git'), {
            stderr: ' ! [rejected]        master -> master (fetch first)\n'
        });
        assert.equal(isPushRejected(error), true);
    });

    test('the refusal in the message itself', () => {
        assert.equal(isPushRejected(new Error('Updates were rejected: non-fast-forward')), true);
        assert.equal(isPushRejected(new Error('failed to push some refs to origin')), true);
    });

    test('every other failure is not a refusal', () => {
        // These get the plain "push failed" wording; calling them refusals
        // would send the reader to fetch commits that are not there.
        assert.equal(isPushRejected(new Error('Could not resolve host: github.com')), false);
        assert.equal(isPushRejected({ gitErrorCode: 'AuthenticationFailed' }), false);
        assert.equal(isPushRejected(undefined), false);
        assert.equal(isPushRejected('permission denied'), false);
    });
});
