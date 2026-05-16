import * as cp from 'child_process';

// Wrapper object so tests can stub `execFile` without touching the non-configurable
// `child_process.execFile` descriptor that newer Node refuses to redefine.
export const exec = {
    execFile: cp.execFile.bind(cp) as typeof cp.execFile
};
