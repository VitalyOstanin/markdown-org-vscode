import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 5000,
        slow: 2000
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        glob('**/*.test.js', { cwd: testsRoot, ignore: '**/*.integration.test.js' })
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

if (require.main === module) {
    run().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
