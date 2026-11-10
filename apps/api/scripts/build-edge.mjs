// apps/api를 Supabase Edge Function(Deno)용 ESM 단일 번들로 만든다.
// - 워크스페이스 소스(apps/api, packages/*)는 번들에 포함한다.
// - npm 패키지는 설치된 버전 그대로 `npm:<name>@<version>` 외부 import로 남겨 Deno가 직접 받게 한다.
// - Node 내장 모듈은 Deno가 요구하는 `node:` 접두사로 바꾼다.
// 산출물(supabase/functions/api/dist/)은 커밋하지 않는다.
import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(apiDir, "../..");
const outfile = path.join(repoRoot, "supabase/functions/api/dist/api.js");

const builtins = new Set(builtinModules.filter((name) => !name.startsWith("_")));

const splitPackageName = (specifier) => {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  return {
    name: parts.slice(0, nameLength).join("/"),
    subpath: parts.slice(nameLength).join("/"),
  };
};

/** import한 파일 위치에서 위로 올라가며 실제 설치된 패키지 버전을 찾는다(pnpm 심볼릭 링크 기준). */
const findInstalledVersion = (name, resolveDir) => {
  let dir = resolveDir;
  while (true) {
    const manifest = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) {
      return JSON.parse(readFileSync(manifest, "utf8")).version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`설치된 패키지를 찾을 수 없습니다: ${name} (from ${resolveDir})`);
    }
    dir = parent;
  }
};

const denoExternalsPlugin = {
  name: "deno-externals",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("node:")) {
        return { path: args.path, external: true };
      }
      if (builtins.has(splitPackageName(args.path).name)) {
        return { path: `node:${args.path}`, external: true };
      }
      // 워크스페이스 패키지는 tsconfig paths로 소스를 번들한다.
      if (args.path.startsWith("@pkpkdupr/")) {
        return undefined;
      }
      const { name, subpath } = splitPackageName(args.path);
      const version = findInstalledVersion(name, args.resolveDir);
      return {
        path: `npm:${name}@${version}${subpath ? `/${subpath}` : ""}`,
        external: true,
      };
    });
  },
};

await build({
  entryPoints: [path.join(apiDir, "src/edge.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  tsconfig: path.join(apiDir, "tsconfig.json"),
  inject: [path.join(apiDir, "scripts/edge-node-globals.mjs")],
  plugins: [denoExternalsPlugin],
  banner: {
    js: "// 생성 파일: pnpm build:edge (apps/api/scripts/build-edge.mjs). 직접 수정하지 않는다.",
  },
  logLevel: "info",
});
