# Privacy And Security

Retrospective is local-first. Its runtime has no telemetry client, remote API,
or network transport. The MCP server uses stdio and the knowledge base is a
SQLite file in the host's persistent plugin data directory.

## Data Stored

- Tool name and tool-call id
- Session id and absolute working directory scope
- Serialized tool input and result, each limited to 6,000 characters
- Inferred success or error outcome
- Concise knowledge written through the retrospective MCP tool

Tool events are transient and are deleted after a successful retrospective.
Knowledge remains until it is retired or the database is removed.

## Not Stored By Design

- Hidden chain-of-thought or private reasoning
- Account credentials requested by the plugin
- Remote analytics or crash reports
- Full conversation transcripts

Tool inputs and outputs may themselves contain secrets or sensitive project
data. Install the plugin only where local capture is acceptable, and inspect
the SQLite file under the host's plugin data directory when auditing stored
content.

## Runtime Permissions

The plugin executes local Node.js hooks and a local stdio MCP server. Codex and
Claude Code retain their normal hook, workspace, and MCP approval boundaries.
Retrospective's hooks are observational and fail open; they never approve,
rewrite, or block another tool call.

## Reporting Security Issues

Do not open a public issue for a vulnerability that exposes user data or enables
code execution. Follow the private reporting instructions in
[SECURITY.md](../SECURITY.md).
