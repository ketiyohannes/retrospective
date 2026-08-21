# Contributing

## Setup

```sh
npm ci
npm run check
```

Node.js 22.14 or newer is required because the implementation uses the built-in
`node:sqlite` module.

## Making Changes

Keep changes focused and preserve these invariants:

- Hook failures never interrupt the user's tool or turn.
- Only observable evidence becomes knowledge.
- Search remains ordered session, project, then global.
- Knowledge reconciliation and event cleanup stay transactional.
- The marketplace payload remains self-contained.

Run `npm run build` after changing source, manifests, hooks, or skills. Commit
the resulting `plugins/retrospective` changes with the source change.

## Validation

```sh
npm run check
claude plugin validate plugins/retrospective --strict
```

Codex plugin validation is also run locally with the built-in `plugin-creator`
validator before releases. CI rebuilds the plugin and verifies that the
committed payload has no diff.

## Versioning

The npm package metadata and both generated plugin manifests share one semantic
version. Bump `package.json`, `.codex-plugin/plugin.json`, and
`packaging/claude-plugin.json` together, update `CHANGELOG.md`, then rebuild.
