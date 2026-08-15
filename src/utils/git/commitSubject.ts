/**
 * The subject of a commit message: everything up to the first line break.
 *
 * The panel lists commits one per row, and a message with a body would
 * otherwise put its whole body in that row. Split out of the status collector
 * so it can be tested without a host: the collector reaches the Git extension,
 * and every repository the integration suite builds is committed with `-m`, so
 * a message with a body never reaches it there.
 */
export function commitSubject(message: string): string {
    const end = message.search(/[\r\n]/);
    return (end === -1 ? message : message.slice(0, end)).trim();
}
