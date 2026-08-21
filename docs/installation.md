# Installation

Retrospective is distributed from this GitHub repository as a self-contained
plugin for Codex and Claude Code. The repository can remain private as long as
the installing user has Git credentials that can read it.

## Requirements

- Node.js 22.14 or newer
- Git
- Codex with plugin marketplace support, or Claude Code with `/plugin` support

No database server, API key, or network service is required at runtime.

## Codex

Register the GitHub marketplace:

```sh
codex plugin marketplace add ketiyohannes/retrospective --ref main
```

Restart the ChatGPT desktop app, open the Plugins Directory, choose the
**Retrospective** source, and install **Retrospective**. Codex does not trust
new command hooks automatically. Run `/hooks`, review the three definitions,
and trust them to enable automatic capture.

To fetch a newer marketplace snapshot:

```sh
codex plugin marketplace upgrade retrospective
```

Then update or reinstall the plugin from the Plugins Directory and start a new
task.

## Claude Code

Register the marketplace and install the plugin:

```sh
claude plugin marketplace add ketiyohannes/retrospective
claude plugin install retrospective@retrospective
```

Run `/reload-plugins` or restart Claude Code. Use `/mcp` to confirm that the
`retrospective` server is connected. The skill is available as
`/retrospective:retrospective`.

Update with:

```sh
claude plugin marketplace update retrospective
claude plugin update retrospective@retrospective
```

## Local Development

Build the distributable payload before loading it:

```sh
npm ci
npm run build
```

For Claude Code:

```sh
claude --plugin-dir ./plugins/retrospective
```

For Codex, add the repository root as a local marketplace:

```sh
codex plugin marketplace add .
```

The checked-in catalog always points to `plugins/retrospective`, not the source
files at the repository root.

## Troubleshooting

- Missing hooks: reload plugins, then review trust with `/hooks` in Codex.
- Missing Claude tools: run `/mcp`, approve the server if prompted, and reload.
- Stale plugin: update the marketplace first, then update or reinstall the
  plugin.
- Server startup failure: confirm `node --version` is at least 22.14.
- No automatic retrospective: at least one completed non-retrospective tool
  event must exist in the current session.
