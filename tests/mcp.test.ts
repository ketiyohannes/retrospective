import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

test("bundled MCP server exposes the retrospective workflow", async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), "retrospective-mcp-"));
  const serverPath = fileURLToPath(
    new URL("../runtime/mcp/server.js", import.meta.url),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--no-warnings", serverPath],
    env: {
      ...getDefaultEnvironment(),
      RETROSPECTIVE_DATA_DIR: dataDirectory,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "retrospective-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name).sort(),
      [
        "apply_retrospective",
        "get_retrospective_context",
        "search_knowledge",
      ],
    );

    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: "get_retrospective_context",
        arguments: {},
      }),
    );
    const content = result.content[0];
    assert.equal(content?.type, "text");
    if (content?.type === "text") {
      assert.deepEqual(JSON.parse(content.text), {
        sessionId: null,
        events: [],
        relatedKnowledge: [],
      });
    }
  } finally {
    await client.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
