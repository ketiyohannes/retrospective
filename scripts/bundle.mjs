import { build } from "esbuild";

await build({
  entryPoints: {
    "mcp/server": "src/mcp/server.ts",
    "hooks/pre-tool-use": "src/hooks/pre-tool-use.ts",
    "hooks/post-tool-use": "src/hooks/post-tool-use.ts",
    "hooks/post-tool-use-failure": "src/hooks/post-tool-use-failure.ts",
    "hooks/stop": "src/hooks/stop.ts",
  },
  outdir: "dist/runtime",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  sourcemap: false,
  minify: false,
});
