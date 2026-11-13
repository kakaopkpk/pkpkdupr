import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RatingTrendChart, {
  type RatingTrendPoint,
} from "@/components/profile/RatingTrendChart";

const now = new Date("2026-11-13T12:00:00.000Z");

const render = (points: RatingTrendPoint[]) =>
  renderToStaticMarkup(
    <RatingTrendChart points={points} ariaLabel="추세" now={now} />,
  );

// 선은 fill="none"인 path이고, 영역 path와 구분된다
const getLineXs = (markup: string) => {
  const d = /<path d="([^"]+)"[^>]*fill="none"/.exec(markup)?.[1] ?? "";
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)/g)].map((match) => Number(match[1]));
};

describe("RatingTrendChart", () => {
  it("이틀 연속 경기한 날도 시간 간격과 상관없이 폭 전체에 펼친다", () => {
    const markup = render([
      { rating: 3.5, createdAt: "2026-11-12T11:00:00.000Z", source: "match" },
      { rating: 3.2, createdAt: "2026-11-13T11:00:00.000Z", source: "match" },
    ]);

    expect(getLineXs(markup)).toEqual([34, 318]);
    expect(markup).toContain("11월 12일");
    expect(markup).toContain("오늘");
    expect(markup).toContain("3.50");
    expect(markup).toContain("3.20");
  });

  it("경기일 점은 같은 간격이고 anchor에는 점을 찍지 않는다", () => {
    const markup = render([
      { rating: 3.3, createdAt: "2026-10-14T12:00:00.000Z", source: "anchor" },
      { rating: 3.35, createdAt: "2026-10-20T11:00:00.000Z", source: "match" },
      { rating: 3.31, createdAt: "2026-11-12T11:00:00.000Z", source: "match" },
    ]);

    expect(getLineXs(markup)).toEqual([34, 176, 318]);
    // 가운데 경기일 점(r 2.5) 하나와 끝점(r 4) 하나
    expect(markup.match(/<circle/g)).toHaveLength(2);
    expect(markup).toContain("10월 14일");
    expect(markup).toContain("11월 12일");
  });

  it("오늘 처음 받은 평점 하나뿐이면 날짜 라벨 없이 오늘만 보인다", () => {
    const markup = render([
      { rating: 3.5, createdAt: "2026-11-13T10:00:00.000Z", source: "match" },
    ]);

    expect(markup).toContain("오늘");
    expect(markup).not.toContain("11월 13일");
  });

  it("최고·최저가 너무 가까우면 최고 라벨만 보인다", () => {
    const markup = render([
      { rating: 3.3, createdAt: "2026-11-10T11:00:00.000Z", source: "match" },
      { rating: 3.31, createdAt: "2026-11-12T11:00:00.000Z", source: "match" },
    ]);

    expect(markup).toContain("3.31");
    expect(markup).not.toContain(">3.30<");
  });
});
