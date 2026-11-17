import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RatingTrendChart, {
  pickRatingTicks,
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

// 선 path의 y 좌표들
const getLineYs = (markup: string) => {
  const d = /<path d="([^"]+)"[^>]*fill="none"/.exec(markup)?.[1] ?? "";
  return [...d.matchAll(/[ML]\s*-?[\d.]+ (-?[\d.]+)/g)].map((match) =>
    Number(match[1]),
  );
};

// 왼쪽 눈금 라벨(위 → 아래)과 그 y 좌표
const getTickLabels = (markup: string) =>
  [...markup.matchAll(/<text y="([\d.]+)" x="28"[^>]*>([\d.]+)<\/text>/g)].map(
    (match) => ({ y: Number(match[1]), label: match[2] }),
  );

describe("RatingTrendChart", () => {
  it("이틀 연속 경기한 날도 시간 간격과 상관없이 폭 전체에 펼친다", () => {
    const markup = render([
      { rating: 3.5, createdAt: "2026-11-12T11:00:00.000Z" },
      { rating: 3.2, createdAt: "2026-11-13T11:00:00.000Z" },
    ]);

    expect(getLineXs(markup)).toEqual([34, 318]);
    expect(markup).toContain("11월 12일");
    expect(markup).toContain("오늘");
    // 3.20~3.50은 0.2 간격 눈금 3.20~3.60 안에 든다
    expect(getTickLabels(markup)).toEqual([
      { y: 14, label: "3.60" },
      { y: 54, label: "3.40" },
      { y: 94, label: "3.20" },
    ]);
  });

  it("경기일은 같은 간격이고 점은 끝점 하나만 찍는다", () => {
    const markup = render([
      { rating: 3.3, createdAt: "2026-10-14T12:00:00.000Z" },
      { rating: 3.35, createdAt: "2026-10-20T11:00:00.000Z" },
      { rating: 3.31, createdAt: "2026-11-12T11:00:00.000Z" },
    ]);

    expect(getLineXs(markup)).toEqual([34, 176, 318]);
    // 중간 경기일에는 점을 찍지 않고 끝점(r 4)만 있다
    expect(markup.match(/<circle/g)).toHaveLength(1);
    expect(markup).toContain('r="4"');
    expect(markup).toContain("10월 14일");
    expect(markup).toContain("11월 12일");
  });

  it("처음 렌더에서 선 그리기·면 페이드·끝점 pop 모션을 붙인다", () => {
    const markup = render([
      { rating: 3.3, createdAt: "2026-10-20T11:00:00.000Z" },
      { rating: 3.35, createdAt: "2026-11-12T11:00:00.000Z" },
    ]);

    expect(markup).toMatch(
      /<path d="[^"]+" pathLength="1"[^>]*class="animate-pk-draw motion-reduce:animate-none" style="animation-delay:250ms;animation-duration:600ms"/,
    );
    // 면이 선 그리기 중간부터 페이드한다
    expect(
      markup.match(
        /class="animate-pk-fade-in motion-reduce:animate-none" style="animation-delay:550ms;animation-duration:400ms"/g,
      ),
    ).toHaveLength(1);
    expect(markup).toMatch(
      /<circle[^>]*class="animate-pk-pop motion-reduce:animate-none[^"]*" style="animation-delay:800ms;animation-duration:360ms"/,
    );
  });

  it("오늘 처음 받은 평점 하나뿐이면 날짜 라벨 없이 오늘만 보인다", () => {
    const markup = render([
      { rating: 3.5, createdAt: "2026-11-13T10:00:00.000Z" },
    ]);

    expect(markup).toContain("오늘");
    expect(markup).not.toContain("11월 13일");
  });

  it("작은 변동은 0.025 간격 눈금으로 세로 범위 0.05에 펼치고 소수 셋째 자리로 쓴다", () => {
    const markup = render([
      { rating: 3.3, createdAt: "2026-11-10T11:00:00.000Z" },
      { rating: 3.32, createdAt: "2026-11-12T11:00:00.000Z" },
    ]);

    expect(getTickLabels(markup)).toEqual([
      { y: 14, label: "3.325" },
      { y: 54, label: "3.300" },
      { y: 94, label: "3.275" },
    ]);
    const [startY, endY] = getLineYs(markup);
    expect(startY).toBeCloseTo(54);
    expect(endY).toBeCloseTo(22);
  });
});

describe("pickRatingTicks", () => {
  it.each([
    { min: 3.2, max: 3.5, low: 3.2, step: 0.2 },
    { min: 3.21, max: 3.29, low: 3.2, step: 0.05 },
    { min: 3.3, max: 3.305, low: 3.275, step: 0.025 },
    // 점 하나면 그 평점이 가운데 줄에 온다
    { min: 3, max: 3, low: 2.975, step: 0.025 },
  ])("$min~$max → 맨 아래 $low, 간격 $step", ({ min, max, low, step }) => {
    const ticks = pickRatingTicks(min, max);
    expect(ticks.step).toBe(step);
    expect(ticks.low).toBeCloseTo(low);
  });
});
