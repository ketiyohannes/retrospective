# Database And Search

Retrospective deliberately uses two tables. `tool_events` is short-lived raw
evidence; `knowledge` is compact, reusable memory. Keeping them separate makes
the hot pre-tool search independent from session evidence volume.

## Knowledge

| Field | Meaning |
| --- | --- |
| `id` | Integer identity |
| `source_session_id` | Session that produced the lesson |
| `scope` | `global`, `project:<absolute path>`, or `session:<id>` |
| `cue` | Short searchable trigger phrase |
| `content` | Direct reusable instruction or fact |
| `state` | `active`, `superseded`, or `retired` |
| `replaces_id` | Prior record replaced by this one |

Active knowledge is indexed by `(state, scope)`. An FTS5 external-content index
covers `cue` and `content`, with cues weighted more heavily. If the local SQLite
build lacks FTS5, the same API falls back to case-insensitive term matching.

Search always considers exactly three scopes in this order:

1. `session:<current session>`
2. `project:<current absolute working directory>`
3. `global`

Narrower knowledge is returned first. A project or session exception is added
at that narrower scope rather than replacing a broader lesson.

## Tool Events

| Field | Meaning |
| --- | --- |
| `tool_use_id` | Host-provided tool-call identity and primary key |
| `session_id` | Host session identity |
| `scope` | Project scope captured at call time |
| `tool_name` | Tool observed by the hook |
| `input` | Serialized input, truncated to 6,000 characters |
| `result` | Serialized output, truncated to 6,000 characters |
| `outcome` | `pending`, `success`, or `error` |

The index `(session_id, outcome)` supports the Stop-hook count and the single
session read used by the retrospective. Processed events are deleted after a
successful `apply_retrospective` transaction.

## Lifecycle

- `add`: insert new active knowledge.
- `keep`: verify that an existing active record still applies.
- `replace`: mark one active record superseded and insert its replacement in
  the same scope.
- `retire`: mark one active record retired without replacement.

Only active knowledge participates in retrieval. Superseded and retired rows
remain as a compact audit trail.

## Storage

The database is named `retrospective.sqlite3` and lives in the persistent data
directory supplied by the host:

- Codex: `${PLUGIN_DATA}/retrospective.sqlite3`
- Claude Code: `${CLAUDE_PLUGIN_DATA}/retrospective.sqlite3`

Tests and explicit deployments can override this with
`RETROSPECTIVE_DATA_DIR`.
