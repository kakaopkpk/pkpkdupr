import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/** 배포 하위 경로(예: GitHub Pages `/pkpkdupr/`). 앞뒤 `/`를 보장하고, 없으면 `/`. */
const normalizeBasePath = (value: string | undefined) => {
  const trimmed = value?.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
};

const basePath = normalizeBasePath(process.env.VITE_BASE_PATH);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// admin-web은 같은 Pages 사이트의 `<base>admin/`에 배포된다. web 서비스워커 scope 안이므로
// 이 경로의 탐색 요청을 web index.html로 가로채지 않도록 navigateFallback에서 뺀다.
const adminPathPattern = new RegExp(`^${escapeRegExp(basePath)}admin(?:/|$)`);
// 개인정보처리방침은 정적 페이지(public/privacy.html)라 SPA index.html로 대신 응답하지 않는다.
const privacyPathPattern = new RegExp(`^${escapeRegExp(basePath)}privacy\\.html$`);

const fallbackAppVersion =
  (
    JSON.parse(
      readFileSync(new URL("./package.json", import.meta.url), "utf8"),
    ) as {
      version?: string;
    }
  ).version ?? "0.0.0";

const appVersion = (() => {
  const envVersion = process.env.VITE_APP_VERSION?.trim();
  if (envVersion) return envVersion;
  try {
    return execSync("git describe --tags --abbrev=0", {
      cwd: configDir,
      encoding: "utf8",
    }).trim();
  } catch {
    return fallbackAppVersion;
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      devOptions: {
        enabled: true,
        navigateFallback: `${basePath}index.html`,
        navigateFallbackAllowlist: [
          new RegExp(`^${escapeRegExp(basePath)}$`),
          new RegExp(`^${escapeRegExp(basePath)}login$`),
        ],
      },
      includeAssets: [
        "favicon-v2.png",
        "pwa-192x192-v2.png",
        "pwa-512x512-v2.png",
        "pwa-maskable-512x512-v2.png",
      ],
      manifest: {
        name: "pkpkdupr",
        short_name: "pkpkdupr",
        description: "Pickleball Rating match and member app",
        id: basePath,
        lang: "ko",
        start_url: basePath,
        scope: basePath,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          {
            src: `${basePath}pwa-192x192-v2.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${basePath}pwa-512x512-v2.png`,
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: `${basePath}pwa-maskable-512x512-v2.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        inlineWorkboxRuntime: true,
        importScripts: [`${basePath}cleanup-outdated-caches.js`],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: `${basePath}index.html`,
        navigateFallbackDenylist: [/^\/api\//, adminPathPattern, privacyPathPattern],
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard(?:@[^/]+)?\/dist\/web\/.+\.(?:css|woff2?)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pkpkdupr-pretendard-v1",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern:
              /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/avatars\/.+$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pkpkdupr-avatar-v1",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              // Storage는 다른 origin이라 crossorigin 없는 <img> 요청의 응답이 opaque(status 0)로 온다.
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pkpkdupr/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
