import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 아바타가 쓰는 lib/api가 Supabase 환경변수를 요구하므로 대신한다
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  resolveAssetUrl: (url?: string | null) => url ?? null,
}));

import { SessionRankChangeCount } from "./SessionReportParts";

describe("SessionRankChangeCount", () => {
  it("세기 전에는 세션 전 순위 기준 '–'를 보이고 폭은 최종 변동으로 잡는다", () => {
    const html = renderToStaticMarkup(
      <SessionRankChangeCount report={{ rankBefore: 6, rankAfter: 4 }} />,
    );

    // 자리 잡기 글자(보이지 않음)가 최종 ▲2, 보이는 글자가 세는 중인 –
    expect(html).toContain("▲2");
    expect(html.indexOf("▲2")).toBeLessThan(html.indexOf("–"));
  });

  it("하락은 최종 ▼n으로 폭을 잡는다", () => {
    const html = renderToStaticMarkup(
      <SessionRankChangeCount report={{ rankBefore: 3, rankAfter: 5 }} />,
    );

    expect(html).toContain("▼2");
  });

  it.each([
    { rankBefore: 4, rankAfter: 4 },
    { rankBefore: null, rankAfter: 4 },
    { rankBefore: 6, rankAfter: null },
  ])("변동이 없거나 모르면 그리지 않는다 (%o)", (report) => {
    expect(
      renderToStaticMarkup(<SessionRankChangeCount report={report} />),
    ).toBe("");
  });
});
