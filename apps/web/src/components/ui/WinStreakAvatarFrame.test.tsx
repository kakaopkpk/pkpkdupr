import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WIN_STREAK_MIN } from "@pkpkdupr/shared/streak";
import { WinStreakAvatarFrame } from "@/components/ui/WinStreakAvatarFrame";

const render = (winStreak: number | null) =>
  renderToStaticMarkup(
    <WinStreakAvatarFrame winStreak={winStreak} size="lg">
      <span>avatar</span>
    </WinStreakAvatarFrame>,
  );

describe("WinStreakAvatarFrame", () => {
  it("연승 기준점(3연승)부터 링과 연승 태그를 붙인다", () => {
    expect(WIN_STREAK_MIN).toBe(3);
    const markup = render(3);
    expect(markup).toContain("pk-streak-ring");
    expect(markup).toContain("3연승 중");
  });

  it("기준점보다 짧은 연승이나 연승 없음은 아바타만 그린다", () => {
    expect(render(2)).not.toContain("pk-streak-ring");
    expect(render(null)).not.toContain("pk-streak-ring");
  });

  it("3~9연승은 1단계, 10연승부터 굵은 링이다", () => {
    expect(render(9)).toContain("--pk-streak-ring:2.5px");
    expect(render(10)).toContain("--pk-streak-ring:3.5px");
  });
});
