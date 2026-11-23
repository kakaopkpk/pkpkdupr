import { describe, expect, it } from "vitest";
import { wrapText } from "@/lib/shareImage";
import { toTransparent } from "@/lib/shareImageCanvas";

describe("wrapText", () => {
  // 글자 하나를 너비 1로 잰다
  const measure = (value: string) => Array.from(value).length;

  it("한 줄에 들어가면 그대로", () => {
    expect(wrapText("다섯 경기 연달아 승리", 20, measure)).toEqual(["다섯 경기 연달아 승리"]);
  });

  it("띄어쓰기 단위로 나눈다", () => {
    expect(wrapText("패배한 조합 그대로 바로 다음 경기에서 승리", 10, measure)).toEqual([
      "패배한 조합 그대로",
      "바로 다음 경기에서",
      "승리",
    ]);
  });

  it("한 줄보다 긴 낱말은 글자 단위로 자른다", () => {
    expect(wrapText("가나다라마바사", 3, measure)).toEqual(["가나다", "라마바", "사"]);
  });
});

describe("toTransparent", () => {
  it("6자리 16진 색은 같은 색의 투명으로", () => {
    expect(toTransparent("#ffb627")).toBe("rgba(255, 182, 39, 0)");
  });

  it("그 밖의 표기는 transparent", () => {
    expect(toTransparent("oklch(0.8 0.1 80)")).toBe("transparent");
  });
});
