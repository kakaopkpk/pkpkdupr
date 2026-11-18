// web 앱을 폰 폭으로 렌더링해 화면별 스냅샷을 만든다.
// 화면마다 PNG(실제 모습)와 HTML(실제 DOM, 클래스 그대로)을 쓰고, 앱이 쓰는 CSS 전체는 app.css 하나로 쓴다.
// 디자인 시안의 "지금" 보드 재료로 쓴다(.claude/skills/design-canvas/SKILL.md).
//
// 재생(기본, Docker 불필요): pnpm design:snapshot [화면 이름...]
//   web(Vite)만 직접 띄우고, 로그인·API·이미지 요청은 fixtures/responses.json의 녹화 응답으로 답한다.
//   브라우저 시계는 녹화 시각에 고정한다.
// 녹화(Docker 필요): pnpm dev가 떠 있는 상태에서 pnpm design:snapshot --record
//   로컬 앱(dev mock)을 돌며 응답을 dev mock 아이디를 바꾼 상태로 fixtures/responses.json에 저장한다.
// 환경 변수: DESIGN_SNAPSHOT_URL(녹화 대상, 기본 http://localhost:8080), DESIGN_SNAPSHOT_OUT(기본 .design-snapshots)
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RECORD_URL = process.env.DESIGN_SNAPSHOT_URL ?? "http://localhost:8080";
const REPLAY_PORT = 8091;
const REPLAY_SUPABASE_URL = "http://127.0.0.1:54399";
const OUT_DIR = path.resolve(process.env.DESIGN_SNAPSHOT_OUT ?? ".design-snapshots");
const FIXTURE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "responses.json");
const VIEWPORT = { width: 390, height: 844 };
const LOGIN = { username: "dev_alice", password: "devpass1234" };
const SETTLE_MS = 1500;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// 시안 예시 데이터가 실제 아이디 형식이 되도록 API 응답의 dev mock 아이디를 바꾼다.
const NAME_MAP = {
  dev_chris_inactive: "chris.b",
  dev_alice: "minsu.kim",
  dev_bob: "jay.21",
  dev_cara: "hana.lee",
  dev_dana: "sora.park",
  dev_ella: "jun.oh",
  dev_finn: "yuna.k",
  dev_gabe: "tae.92",
  dev_hugo: "eun.s",
  test1: "dami.c",
  test2: "hoon.lee",
};
const NAME_PATTERN = new RegExp(`\\b(${Object.keys(NAME_MAP).join("|")})\\b`, "g");

const MATCH_ROW_NAME = /^\d{1,2}:\d{2}/;
const MEMBER_NAME = new RegExp(Object.values(NAME_MAP).map((n) => n.replace(".", "\\.")).join("|"));

// expand: 스크롤 영역 전체가 보이도록 뷰포트 높이를 늘려서 찍는다(시트·메뉴는 화면 높이에 맞춰 열리므로 끈다).
const SCREENS = [
  { name: "home", expand: true, run: (page) => openTab(page, "홈") },
  { name: "schedule", expand: true, run: (page) => openTab(page, "일정") },
  { name: "ranking", expand: true, run: (page) => openTab(page, "랭킹") },
  { name: "me", expand: true, run: (page) => openTab(page, "나") },
  { name: "plus-menu", expand: false, run: openPlusMenu },
  {
    name: "record-sheet",
    expand: false,
    run: async (page) => {
      await openPlusMenu(page);
      await page.getByRole("menuitem", { name: "경기 기록" }).click();
    },
  },
  {
    name: "match-detail",
    expand: true,
    run: async (page) => {
      await openTab(page, "홈");
      const row = await firstVisible(page.getByRole("button", { name: MATCH_ROW_NAME }));
      if (!row) throw new Error("홈에 경기 줄이 없습니다(오늘 기록이 있는 세션이 필요).");
      await row.click();
    },
  },
  {
    name: "profile",
    expand: true,
    run: async (page) => {
      await openTab(page, "랭킹");
      await page.getByRole("tabpanel", { name: "랭킹" }).getByRole("button", { name: MEMBER_NAME }).first().click();
    },
  },
  {
    name: "settings",
    expand: false,
    run: async (page) => {
      await openTab(page, "나");
      await page.getByRole("button", { name: "설정" }).first().click();
    },
  },
];

async function main() {
  const args = process.argv.slice(2);
  const record = args.includes("--record");
  const only = args.filter((arg) => !arg.startsWith("--"));
  const screens = only.length ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
  if (!screens.length) {
    throw new Error(`알 수 없는 화면: ${only.join(", ")} (가능: ${SCREENS.map((s) => s.name).join(", ")})`);
  }

  let baseUrl;
  let fixtures;
  let stopVite = async () => {};
  if (record) {
    assertLocalUrl(RECORD_URL);
    await assertAppRunning(RECORD_URL);
    baseUrl = RECORD_URL;
    // 녹화에서 일부 화면만 돌면 나머지 화면의 응답이 빠지므로 기존 녹화에 덧붙인다.
    const previous = only.length ? await loadFixtures().catch(() => null) : null;
    fixtures = { recordedAt: previous?.recordedAt ?? Date.now(), authUserId: previous?.authUserId ?? null, responses: previous?.responses ?? {} };
  } else {
    fixtures = await loadFixtures();
    ({ baseUrl, stop: stopVite } = await startVite());
  }

  // 전체를 찍을 때만 폴더를 비운다. 일부만 찍으면 그 화면 파일만 덮어쓴다.
  if (!only.length) await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const missing = new Set();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      // 서비스 워커가 요청을 가로채면 route로 응답을 바꿀 수 없다.
      serviceWorkers: "block",
    });
    // 녹화와 재생이 같은 시각을 보도록 시계를 고정한다("오늘 세션", "18분째" 등).
    await context.clock.setFixedTime(fixtures.recordedAt);
    await context.route("**/*", record ? (route) => recordRoute(route, fixtures) : (route) => replayRoute(route, fixtures, missing));
    const page = await context.newPage();

    await login(page, baseUrl);
    let cssWritten = false;
    const results = [];
    for (const screen of screens) {
      try {
        await page.setViewportSize(VIEWPORT);
        await page.goto(`${baseUrl}/`);
        await waitForShell(page);
        await screen.run(page);
        await settle(page);
        const height = screen.expand ? await fullHeight(page) : VIEWPORT.height;
        if (height !== VIEWPORT.height) {
          await page.setViewportSize({ width: VIEWPORT.width, height });
          await page.waitForTimeout(400);
        }
        await page.screenshot({ path: path.join(OUT_DIR, `${screen.name}.png`) });
        const { css, html } = await page.evaluate(serializePage, { width: VIEWPORT.width, height, name: screen.name });
        if (!cssWritten) {
          await writeFile(path.join(OUT_DIR, "app.css"), css);
          cssWritten = true;
        }
        await writeFile(path.join(OUT_DIR, `${screen.name}.html`), html);
        results.push(screen.name);
        console.log(`✓ ${screen.name} (390×${height})`);
      } catch (error) {
        console.warn(`✗ ${screen.name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
      }
    }
    await writeFile(path.join(OUT_DIR, "index.html"), await indexPage());
    console.log(`\n${results.length}/${screens.length}개 화면 → ${OUT_DIR}`);
    if (record) {
      await mkdir(path.dirname(FIXTURE_FILE), { recursive: true });
      await writeFile(FIXTURE_FILE, `${JSON.stringify(sortFixtures(fixtures), null, 2)}\n`);
      console.log(`녹화 응답 ${Object.keys(fixtures.responses).length}개 → ${path.relative(process.cwd(), FIXTURE_FILE)}`);
    }
    if (missing.size) {
      console.warn(`\n녹화 응답이 없는 요청 ${missing.size}개(API가 바뀌었을 수 있음):`);
      for (const key of missing) console.warn(`  ${key}`);
      console.warn("Docker가 있는 환경에서 pnpm dev를 띄우고 pnpm design:snapshot --record로 다시 녹화하세요.");
    }
    if (results.length < screens.length || missing.size) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await stopVite();
  }
}

// dev 계정으로 로그인해 화면 데이터를 파일로 남기므로 로컬 앱만 대상으로 한다.
function assertLocalUrl(url) {
  const { hostname } = new URL(url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new Error(`DESIGN_SNAPSHOT_URL은 로컬 주소만 쓸 수 있습니다: ${url}`);
  }
}

async function assertAppRunning(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    throw new Error(`${url}에 앱이 없습니다. 녹화는 pnpm dev(Docker 필요)를 먼저 실행하세요.`);
  }
}

async function loadFixtures() {
  try {
    return JSON.parse(await readFile(FIXTURE_FILE, "utf8"));
  } catch {
    throw new Error(`녹화 응답(${path.relative(process.cwd(), FIXTURE_FILE)})이 없습니다. pnpm design:snapshot --record로 먼저 녹화하세요.`);
  }
}

// 녹화·재생 대상: api 응답, Supabase Auth, Storage(아바타 등). 나머지(Vite 모듈, 글꼴)는 그대로 보낸다.
function requestKind(url) {
  const { pathname } = new URL(url);
  if (pathname.startsWith("/api/")) return "api";
  if (pathname.startsWith("/auth/v1/")) return "auth";
  if (pathname.startsWith("/storage/v1/")) return "storage";
  return null;
}

// 추천 매칭의 seed처럼 실행마다 바뀌는 쿼리는 키에서 뺀다.
const VOLATILE_PARAMS = ["seed"];

function requestKey(request) {
  const url = new URL(request.url());
  for (const name of VOLATILE_PARAMS) url.searchParams.delete(name);
  return `${request.method()} ${url.pathname}${url.search}`;
}

async function recordRoute(route, fixtures) {
  const request = route.request();
  const kind = requestKind(request.url());
  if (!kind) {
    await route.fallback();
    return;
  }
  const response = await route.fetch();
  const headers = { ...response.headers() };
  delete headers["content-length"];
  delete headers["content-encoding"];
  const contentType = headers["content-type"] ?? "";
  if (kind === "auth") {
    // 토큰은 저장하지 않고 재생 때 가짜 세션을 만든다. 회원 id만 남긴다.
    if (request.url().includes("/token")) {
      fixtures.authUserId = (await response.json().catch(() => null))?.user?.id ?? fixtures.authUserId;
    }
    await route.fulfill({ response, headers });
    return;
  }
  if (kind === "storage") {
    const body = await response.body();
    fixtures.responses[requestKey(request)] = { status: response.status(), contentType, base64: body.toString("base64") };
    await route.fulfill({ response, body, headers });
    return;
  }
  const text = contentType.includes("json") ? (await response.text()).replace(NAME_PATTERN, (name) => NAME_MAP[name]) : await response.text();
  fixtures.responses[requestKey(request)] = { status: response.status(), contentType, text };
  await route.fulfill({ response, body: text, headers });
}

async function replayRoute(route, fixtures, missing) {
  const request = route.request();
  const kind = requestKind(request.url());
  if (!kind) {
    await route.fallback();
    return;
  }
  if (kind === "auth") {
    await route.fulfill(fakeAuthResponse(request.url(), fixtures));
    return;
  }
  const key = requestKey(request);
  const saved = fixtures.responses[key];
  if (!saved) {
    missing.add(key);
    await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"녹화 응답 없음"}' });
    return;
  }
  const body = saved.base64 != null ? Buffer.from(saved.base64, "base64") : saved.text;
  await route.fulfill({ status: saved.status, contentType: saved.contentType, body: saved.status === 204 ? undefined : body });
}

// 재생용 Supabase Auth 응답. supabase-js는 토큰을 검증하지 않고 만료 시각만 읽는다.
function fakeAuthResponse(url, fixtures) {
  const now = Math.floor(fixtures.recordedAt / 1000);
  const user = {
    id: fixtures.authUserId ?? "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: `${LOGIN.username}@pkpkdupr.invalid`,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date(fixtures.recordedAt).toISOString(),
  };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: user.id, aud: "authenticated", role: "authenticated", iat: now, exp: now + ONE_YEAR_SECONDS }),
    "design-snapshot",
  ].join(".");
  const { pathname } = new URL(url);
  if (pathname.endsWith("/logout")) return { status: 204 };
  if (pathname.endsWith("/user")) return { status: 200, contentType: "application/json", body: JSON.stringify(user) };
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ONE_YEAR_SECONDS,
      expires_at: now + ONE_YEAR_SECONDS,
      refresh_token: "design-snapshot",
      user,
    }),
  };
}

// 다시 녹화했을 때 diff가 읽히도록 키를 정렬한다.
function sortFixtures(fixtures) {
  const responses = Object.fromEntries(Object.entries(fixtures.responses).sort(([a], [b]) => a.localeCompare(b)));
  return { recordedAt: fixtures.recordedAt, authUserId: fixtures.authUserId, responses };
}

// web(Vite)만 띄운다. Supabase 주소는 재생용 가짜 주소라 실제 연결은 없다.
async function startVite() {
  const baseUrl = `http://localhost:${REPLAY_PORT}`;
  const child = spawn("pnpm", ["--filter", "@pkpkdupr/web", "exec", "vite", "--port", String(REPLAY_PORT), "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: REPLAY_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: "design-snapshot", VITE_API_BASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const stop = async () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // 이미 끝났다.
    }
  };
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) break;
    try {
      if ((await fetch(baseUrl)).ok) return { baseUrl, stop };
    } catch {
      // 아직 뜨는 중이다.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`web(Vite)을 :${REPLAY_PORT}에 띄우지 못했습니다.\n${output.slice(-2000)}`);
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("아이디").fill(LOGIN.username);
  await page.getByLabel("비밀번호").fill(LOGIN.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await waitForShell(page);
}

async function waitForShell(page) {
  await page.getByRole("tablist", { name: "주 메뉴" }).waitFor();
  await page.waitForLoadState("networkidle");
  await dismissPopups(page);
}

// 업적 축하 등 시작 때 뜨는 팝업을 닫는다.
async function dismissPopups(page) {
  for (let i = 0; i < 10; i += 1) {
    const confirm = page.getByRole("dialog").getByRole("button", { name: "확인" });
    if (!(await confirm.first().isVisible().catch(() => false))) return;
    await confirm.first().click();
    await page.waitForTimeout(400);
  }
}

async function openTab(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForLoadState("networkidle");
}

async function openPlusMenu(page) {
  await openTab(page, "홈");
  await page.getByRole("button", { name: "경기 기록·세션 만들기" }).click();
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    if (await locator.nth(i).isVisible()) return locator.nth(i);
  }
  return null;
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(SETTLE_MS);
}

// 맨 위에 보이는 화면의 스크롤 영역이 다 보이는 뷰포트 높이. 화면 가운데 요소에서 가장 가까운 스크롤 조상을 쓴다.
async function fullHeight(page) {
  const extra = await page.evaluate(({ width, height }) => {
    let el = document.elementFromPoint(width / 2, height / 2);
    while (el && el !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) {
        return el.scrollHeight - el.clientHeight;
      }
      el = el.parentElement;
    }
    return 0;
  }, VIEWPORT);
  return VIEWPORT.height + Math.ceil(extra);
}

// 브라우저 안에서 실행된다. 앱 CSS 전체와, 스크립트를 뺀 지금 DOM을 돌려준다.
async function serializePage({ width, height, name }) {
  const imports = [];
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      if (sheet.href) imports.push(`@import url("${sheet.href}");`);
      continue;
    }
    for (const rule of list) {
      (rule instanceof CSSImportRule ? imports : rules).push(rule.cssText);
    }
  }
  const css = `${imports.join("\n")}\n${rules.join("\n")}\n`;

  const toDataUrl = async (src) => {
    try {
      const blob = await (await fetch(src)).blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return src;
    }
  };

  const body = document.body.cloneNode(true);
  body.querySelectorAll("script, noscript, iframe, vite-error-overlay").forEach((el) => el.remove());
  const liveInputs = document.body.querySelectorAll("input, textarea");
  body.querySelectorAll("input, textarea").forEach((el, i) => {
    const value = liveInputs[i]?.value ?? "";
    if (el.tagName === "TEXTAREA") el.textContent = value;
    else el.setAttribute("value", value);
  });
  // 로컬 Storage 등 앱 밖에서 열리지 않는 이미지는 data URL로 넣는다.
  for (const img of body.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!src.startsWith("data:")) img.setAttribute("src", await toDataUrl(new URL(src, location.href).href));
  }

  const attrs = (el) => [...el.attributes].map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join("");
  const html = `<!doctype html>
<!-- pkpkdupr 지금 화면 스냅샷: ${name}, 390×${height}. 스타일은 같은 폴더의 app.css(앱 CSS 전체). -->
<html${attrs(document.documentElement)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${width}, initial-scale=1">
<title>${name}</title>
<link rel="stylesheet" href="./app.css">
</head>
<body${attrs(document.body)}>
${body.innerHTML}
</body>
</html>
`;
  return { css, html };
}

// 폴더에 있는 화면 전부(이번에 찍지 않은 화면 포함)를 SCREENS 순서로 모아 보인다.
async function indexPage() {
  const files = new Set(await readdir(OUT_DIR));
  const cards = SCREENS.filter((s) => files.has(`${s.name}.png`))
    .map(
      (s) =>
        `<figure><figcaption>${s.name}</figcaption><a href="./${s.name}.html"><img src="./${s.name}.png" width="390" alt="${s.name}"></a></figure>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>지금 화면 스냅샷</title>
<style>body{margin:24px;font-family:system-ui,sans-serif;background:#e9ecf3}main{display:flex;gap:24px;align-items:flex-start;overflow-x:auto}figure{margin:0}figcaption{font-size:13px;margin-bottom:8px}img{display:block;border-radius:12px;background:#fff}</style>
</head><body><main>
${cards}
</main></body></html>
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
