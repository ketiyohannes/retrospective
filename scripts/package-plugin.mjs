import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../plugins/retrospective/", import.meta.url);

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const writeJson = async (path, value) =>
  writeFile(new URL(path, output), `${JSON.stringify(value, null, 2)}\n`);

const packageJson = await readJson("package.json");
const codexManifest = await readJson(".codex-plugin/plugin.json");
const claudeManifest = await readJson("packaging/claude-plugin.json");

codexManifest.version = packageJson.version;
codexManifest.mcpServers = "./.mcp.json";
claudeManifest.version = packageJson.version;

await rm(output, { force: true, recursive: true });
await mkdir(new URL(".codex-plugin/", output), { recursive: true });
await mkdir(new URL(".claude-plugin/", output), { recursive: true });

await Promise.all([
  writeJson(".codex-plugin/plugin.json", codexManifest),
  writeJson(".claude-plugin/plugin.json", claudeManifest),
  cp(new URL("packaging/mcp.codex.json", root), new URL(".mcp.json", output)),
  cp(new URL("packaging/mcp.claude.json", root), new URL(".mcp.claude.json", output)),
  cp(new URL("packaging/README.md", root), new URL("README.md", output)),
  cp(new URL("hooks", root), new URL("hooks", output), { recursive: true }),
  cp(new URL("skills", root), new URL("skills", output), { recursive: true }),
  cp(new URL("dist/runtime", root), new URL("dist/runtime", output), {
    recursive: true,
  }),
]);

for (const path of [
  "dist/runtime/mcp/server.js",
  "dist/runtime/hooks/pre-tool-use.js",
  "dist/runtime/hooks/post-tool-use.js",
  "dist/runtime/hooks/post-tool-use-failure.js",
  "dist/runtime/hooks/stop.js",
]) {
  const url = new URL(path, output);
  const content = await readFile(url, "utf8");
  await writeFile(url, content.replace(/[ \t]+$/gm, ""));
}
