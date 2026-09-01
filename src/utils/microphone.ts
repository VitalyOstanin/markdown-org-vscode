import { exec } from './exec';

/**
 * Whether the machine's microphone is muted.
 *
 * A phrase is meant to be said rather than typed, and the editor's speech
 * extension hears nothing from a muted input while showing every sign of
 * listening — the box waits, the indicator moves, and the sentence never
 * arrives. Asking the mixer before the box opens turns that silence into a
 * line of text.
 *
 * The question goes to `pactl`, which answers for both PulseAudio and
 * PipeWire, the two the desktop is built on. Anywhere else — Windows, macOS,
 * a machine without it — there is no answer to be had, and the absence is
 * reported as "not muted": a reminder that cannot be trusted is worse than
 * none, since it would stand on every phrase said on those machines.
 */

/** How long the mixer is given to answer before the question is dropped. */
const MIXER_TIMEOUT_MS = 2000;

/** What `pactl get-source-mute` says of an input that is off. */
const MUTED = /^\s*Mute:\s*yes\s*$/im;

/**
 * Ask the mixer whether the default input is muted.
 *
 * Never rejects: every failure — no `pactl`, no sound server, a reply in a
 * shape this does not know — resolves to `false`, because none of them is
 * evidence that the microphone is off.
 */
export function isMicrophoneMuted(): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            exec.execFile(
                'pactl',
                ['get-source-mute', '@DEFAULT_SOURCE@'],
                { encoding: 'utf-8', timeout: MIXER_TIMEOUT_MS },
                (error, stdout) => {
                    resolve(!error && MUTED.test(stdout));
                }
            );
        } catch {
            resolve(false);
        }
    });
}
