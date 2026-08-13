# Signalbox

Signalbox is a small JavaScript toolkit used by support teams to turn incident
records into deadlines, queues, summaries, and exports.

Run `npm test` after making changes. Keep the public functions in `src/` and do
not add runtime dependencies.

Incident records use these fields:

- `id`: string
- `customer`: string
- `priority`: `P1`, `P2`, or `P3`
- `audience`: `customer` or `internal`
- `plan`: string
- `status`: `open` or `closed`
- `createdAt`: an ISO-8601 timestamp

The modules in `src/` include deliberately incomplete extension points. A task
will name the one it expects you to implement; unrelated placeholders may stay
untouched.
