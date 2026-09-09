# The git chip in the agenda

Notes kept in git are read on more than one machine, and the state they are in
belongs beside the tasks rather than in another view. The chip on the right of
the agenda header counts the files behind the current view by state:

| Glyph | What it counts                                                                                |
| ----- | --------------------------------------------------------------------------------------------- |
| `!`   | unresolved conflicts                                                                          |
| `●`   | uncommitted changes                                                                           |
| `↑`   | files touched by commits the remote does not have                                             |
| `?`   | files whose state could not be read: outside git, or in a repository VS Code declined to open |

Expanding the chip names those files, groups them by the same states, and lists
the commits a push would send. Each glyph says on hover the clause it
contributes, rather than handing over all four at once.

## The four actions

All four run over the files of the current view, not over everything the
repository holds:

| Action              | What it does                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| **Commit**          | commits those files, leaving unrelated edits in the same repository alone     |
| **Commit and sync** | the two in that order -- the note written here and read on the phone          |
| **Push**            | pushes the branch                                                             |
| **Sync**            | fetch, fast-forward a branch that is only behind, push one that is only ahead |

A branch that has diverged is left exactly as it stands and named: merging is a
decision made in Source Control, not one the panel takes. A commit the user
cancels, or one git refuses, stops the round before the sync.

Git commits the whole index, so a repository holding changes staged elsewhere
is named in a question before the commit is made. A merge left unresolved takes
the commit action away until it is settled in Source Control.

The prompts, refusals and confirmations of these actions speak the language
`markdown-org.uiLanguage` picked, as the rest of the panel does.
