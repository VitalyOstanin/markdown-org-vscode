import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000,
        slow: 4000
    });

    const testsRoot = path.resolve(__dirname, '..', 'integration');

    return new Promise((resolve, reject) => {
        glob('**/*.integration.test.js', { cwd: testsRoot })
            .then((files) => {
                files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

                try {
                    mocha.run((failures) => {
                        if (failures > 0) {
                            reject(new Error(`${failures} tests failed.`));
                        } else {
                            resolve();
                        }
                    });
                } catch (err) {
                    reject(err);
                }
            })
            .catch(reject);
    });
}
