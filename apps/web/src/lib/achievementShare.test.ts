import { describe, expect, it } from "vitest";
import {
  getAchievementShareFileName,
  getAchievementShareText,
  wrapText,
} from "@/lib/achievementShare";

describe("getAchievementShareText", () => {
  it("받침 있는 업적 이름이면 '을'", () => {
    expect(getAchievementShareText("brad.ley", "첫 승")).toBe(
      "brad.ley님이 업적 첫 승을 달성했어요",
    );
  });

  it("받침 없는 업적 이름이면 '를'", () => {
    expect(getAchievementShareText("brad.ley", "리벤지")).toBe(
      "brad.ley님이 업적 리벤지를 달성했어요",
    );
  });
});

describe("getAchievementShareFileName", () => {
  it("업적 id로 PNG 파일 이름을 만든다", () => {
    expect(getAchievementShareFileName("rating-4.5")).toBe("pkpkdupr-rating-4.5.png");
  });

  it("파일 이름에 못 쓰는 글자는 -로 바꾼다", () => {
    expect(getAchievementShareFileName("a/b c")).toBe("pkpkdupr-a-b-c.png");
  });
});

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
