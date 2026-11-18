// 로컬 web 앱(pnpm dev, dev mock)을 폰 폭으로 렌더링해 화면별 스냅샷을 만든다.
// 화면마다 PNG(실제 모습)와 HTML(실제 DOM, 클래스 그대로)을 쓰고, 앱이 쓰는 CSS 전체는 app.css 하나로 쓴다.
// 디자인 시안의 "지금" 보드 재료로 쓴다(.claude/skills/design-canvas/SKILL.md).
//
// 사용: pnpm dev가 떠 있는 상태에서 pnpm design:snapshot [화면 이름...]
// 환경 변수: DESIGN_SNAPSHOT_URL(기본 http://localhost:8080), DESIGN_SNAPSHOT_OUT(기본 .design-snapshots)
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DESIGN_SNAPSHOT_URL ?? "http://localhost:8080";
const OUT_DIR = path.resolve(process.env.DESIGN_SNAPSHOT_OUT ?? ".design-snapshots");
const VIEWPORT = { width: 390, height: 844 };
const LOGIN = { username: "dev_alice", password: "devpass1234" };
const SETTLE_MS = 1500;

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
      await page.getByRole("tabpanel", { name: "랭킹" }).getByRole("button", { name: /\./ }).first().click();
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
  const only = process.argv.slice(2);
  const screens = only.length ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
  if (!screens.length) {
    throw new Error(`알 수 없는 화면: ${only.join(", ")} (가능: ${SCREENS.map((s) => s.name).join(", ")})`);
  }
  await assertAppRunning();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  await context.route("**/api/**", rewriteNames);
  const page = await context.newPage();

  await login(page);
  let cssWritten = false;
  const results = [];
  for (const screen of screens) {
    try {
      await page.setViewportSize(VIEWPORT);
      await page.goto(`${BASE_URL}/`);
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
      results.push({ name: screen.name, height });
      console.log(`✓ ${screen.name} (390×${height})`);
    } catch (error) {
      console.warn(`✗ ${screen.name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    }
  }
  await browser.close();
  await writeFile(path.join(OUT_DIR, "index.html"), indexPage(results));
  console.log(`\n${results.length}/${screens.length}개 화면 → ${OUT_DIR}`);
  if (results.length < screens.length) {
    process.exitCode = 1;
  }
}

async function assertAppRunning() {
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    throw new Error(`${BASE_URL}에 앱이 없습니다. 먼저 pnpm dev를 실행하세요.`);
  }
}

async function rewriteNames(route) {
  const response = await route.fetch();
  const type = response.headers()["content-type"] ?? "";
  if (!type.includes("json")) {
    await route.fulfill({ response });
    return;
  }
  const body = (await response.text()).replace(NAME_PATTERN, (name) => NAME_MAP[name]);
  const headers = { ...response.headers() };
  delete headers["content-length"];
  delete headers["content-encoding"];
  await route.fulfill({ response, body, headers });
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
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

function indexPage(results) {
  const cards = results
    .map(
      (r) =>
        `<figure><figcaption>${r.name} · 390×${r.height}</figcaption><a href="./${r.name}.html"><img src="./${r.name}.png" width="390" alt="${r.name}"></a></figure>`,
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
