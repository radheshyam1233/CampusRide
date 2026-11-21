import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";

const frontend = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "run", "build"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_CAMPUSRIDE_HOSTED: "1" },
  },
);
if (frontend.status !== 0) process.exit(frontend.status ?? 1);

async function assets(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      const key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return assets(path, key);
      return { [key]: (await readFile(path)).toString("base64") };
    }),
  );
  return Object.assign({}, ...files);
}

const files = await assets("client/dist");
await build({
  entryPoints: ["worker/index.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "inline",
  plugins: [
    {
      name: "campusride-assets",
      setup(plugin) {
        plugin.onResolve({ filter: /^virtual:campusride-assets$/ }, () => ({
          path: "assets",
          namespace: "campusride",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "campusride" }, () => ({
          contents: `export default ${JSON.stringify(files)}`,
        }));
      },
    },
  ],
});
console.log(
  `Built the private Worker with ${Object.keys(files).length} frontend assets.`,
);
