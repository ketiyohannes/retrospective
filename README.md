# Retrospective

Retrospective is a local-first Codex plugin that turns completed work into concise, searchable lessons for future sessions.

## How It Works

- `PreToolUse` stores the pending tool event and injects up to three relevant lessons from session, project, and global scopes.
- `PostToolUse` records the result and outcome using the same tool-call id.
- `Stop` requests one guarded retrospective continuation when completed evidence exists.
- The `$retrospective` skill reviews observable evidence and uses the bundled MCP server to add, keep, replace, or retire knowledge.
- SQLite stays in Codex's writable plugin data directory on the user's device. The schema uses FTS5 when available and a compatible text-search fallback otherwise.

The plugin ignores its own MCP calls, fails open if a hook cannot read or write the database, and never asks the model to expose or persist hidden chain-of-thought.

## Requirements

- Node.js 22.14 or newer
- npm

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` compiles the library and creates self-contained runtime bundles under `dist/runtime`. `npm test` covers migrations, scoped search, lifecycle changes, hook entrypoints, and the MCP protocol.

## MCP Tools

- `get_retrospective_context`: loads completed events and related active knowledge for a session.
- `search_knowledge`: searches session, project, and global memory.
- `apply_retrospective`: transactionally applies lifecycle changes and clears processed events.
