import { describe, expect, it } from "vitest";
import {
  getAchievementShareFileName,
  getAchievementShareText,
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
