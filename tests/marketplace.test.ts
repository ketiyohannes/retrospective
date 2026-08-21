import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const plugin = join(root, "plugins", "retrospective");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("Codex and Claude marketplaces expose the same packaged plugin", () => {
  const codex = readJson(
    join(root, ".agents", "plugins", "marketplace.json"),
  );
  const claude = readJson(join(root, ".claude-plugin", "marketplace.json"));
  const codexPlugin = (codex.plugins as Array<Record<string, unknown>>)[0];
  const claudePlugin = (claude.plugins as Array<Record<string, unknown>>)[0];

  assert.equal(codex.name, "retrospective");
  assert.equal(claude.name, "retrospective");
  assert.equal(
    (codexPlugin?.source as Record<string, unknown>).path,
    "./plugins/retrospective",
  );
  assert.equal(claudePlugin?.source, "./plugins/retrospective");
});

test("packaged plugin is self-contained and version aligned", () => {
  const packageJson = readJson(join(root, "package.json"));
  const codex = readJson(join(plugin, ".codex-plugin", "plugin.json"));
  const claude = readJson(join(plugin, ".claude-plugin", "plugin.json"));

  assert.equal(codex.version, packageJson.version);
  assert.equal(claude.version, packageJson.version);
  assert.equal(codex.mcpServers, "./.mcp.json");
  assert.equal(claude.mcpServers, "./.mcp.claude.json");

  for (const path of [
    "dist/runtime/mcp/server.js",
    "dist/runtime/hooks/pre-tool-use.js",
    "dist/runtime/hooks/post-tool-use.js",
    "dist/runtime/hooks/post-tool-use-failure.js",
    "dist/runtime/hooks/stop.js",
    "hooks/hooks.json",
    "hooks/claude-hooks.json",
    "skills/retrospective/SKILL.md",
    ".mcp.json",
    ".mcp.claude.json",
  ]) {
    assert.equal(existsSync(join(plugin, path)), true, `missing ${path}`);
  }
});

test("shared hooks use path variables supported by both hosts", () => {
  const hooks = readFileSync(join(plugin, "hooks", "hooks.json"), "utf8");

  assert.match(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(hooks, /\$\{PLUGIN_ROOT\}/);
});
