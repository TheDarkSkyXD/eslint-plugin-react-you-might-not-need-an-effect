import { build } from "esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  sourcemap: true,
  format: "cjs",
  outfile: "dist/index.cjs",
  platform: "node",
  external: ["eslint"],
});
