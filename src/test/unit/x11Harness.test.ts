import * as assert from 'assert';
import * as path from 'path';
import { suite, test } from 'mocha';

/**
 * The demo drivers (`scripts/record-demo.js`, `scripts/screenshot-demo.js`) and
 * the integration wrapper (`scripts/run-integration-tests.js`) are plain
 * CommonJS, so their shared module is loaded the same way here.
 */
interface X11Harness {
    x11ChildEnv(extra?: NodeJS.ProcessEnv, base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const harness = require(path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'x11-harness.js')) as X11Harness;

suite('x11ChildEnv', () => {
    test('drops WAYLAND_DISPLAY and pins the session to X11', () => {
        const env = harness.x11ChildEnv({}, { WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland' });
        assert.strictEqual(env.WAYLAND_DISPLAY, undefined);
        assert.strictEqual(env.XDG_SESSION_TYPE, 'x11');
        assert.strictEqual(env.GDK_BACKEND, 'x11');
        assert.strictEqual(env.ELECTRON_OZONE_PLATFORM_HINT, 'x11');
    });

    test('carries the rest of the environment through', () => {
        const env = harness.x11ChildEnv({}, { PATH: '/usr/bin', HOME: '/home/demo' });
        assert.strictEqual(env.PATH, '/usr/bin');
        assert.strictEqual(env.HOME, '/home/demo');
    });

    test('extra entries are applied on top of the inherited environment', () => {
        const env = harness.x11ChildEnv({ DISPLAY: ':99' }, { DISPLAY: ':0' });
        assert.strictEqual(env.DISPLAY, ':99');
    });

    test('the X11 pins win over an extra that tries to set them back', () => {
        // A caller passing a Wayland hint through `extra` would otherwise undo
        // the whole point of the helper.
        const env = harness.x11ChildEnv({ XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }, {});
        assert.strictEqual(env.XDG_SESSION_TYPE, 'x11');
        assert.strictEqual(env.WAYLAND_DISPLAY, undefined);
    });
});
