import { describe, expect, it } from "vitest";
import {
  INTERNAL_EMAIL_DOMAIN,
  isValidUsername,
  toInternalEmail,
} from "../auth";

describe("isValidUsername", () => {
  it.each([
    "dev_alice",
    "Dev_Alice",
    "a",
    "test1",
    "kim.minsu",
    "a-b_c.d",
    "a".repeat(64),
    " dev_alice ",
  ])("%j는 허용한다", (username) => {
    expect(isValidUsername(username)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "a".repeat(65),
    "김민수",
    "dev alice",
    "dev@alice",
    "dev+alice",
    ".alice",
    "alice.",
    "al..ice",
  ])("%j는 거부한다", (username) => {
    expect(isValidUsername(username)).toBe(false);
  });
});

describe("toInternalEmail", () => {
  it("앞뒤 공백을 떼고 소문자로 바꾼 아이디에 내부 도메인을 붙인다", () => {
    expect(toInternalEmail(" Dev_Alice ")).toBe(
      `dev_alice@${INTERNAL_EMAIL_DOMAIN}`,
    );
  });

  it("대소문자만 다른 아이디는 같은 이메일이 된다", () => {
    expect(toInternalEmail("Member")).toBe(toInternalEmail("member"));
  });

  it("내부 도메인은 메일이 배달되지 않는 예약 TLD다", () => {
    expect(INTERNAL_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
  });
});
