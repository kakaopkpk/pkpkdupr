import { describe, expect, it } from "vitest";
import { getGuestAddOption } from "./guestAdd";

describe("getGuestAddOption", () => {
  it("회원 목록을 받았고 검색 결과가 없으면 앞뒤 공백을 뗀 검색어로 추가 줄을 보인다", () => {
    expect(
      getGuestAddOption({
        query: "  mina.k ",
        playersStatus: "ready",
        existingUsernames: [],
      }),
    ).toEqual({ username: "mina.k", isValid: true });
  });

  it("검색어를 포함한 아이디가 있어도 똑같은 아이디가 없으면 추가 줄을 보인다", () => {
    expect(
      getGuestAddOption({
        query: "kim",
        playersStatus: "ready",
        existingUsernames: ["kim.jh", "kimchi_7"],
      }),
    ).toEqual({ username: "kim", isValid: true });
  });

  it("대소문자만 다른 같은 아이디가 이미 있으면 보이지 않는다", () => {
    expect(
      getGuestAddOption({
        query: " Kim.JH ",
        playersStatus: "ready",
        existingUsernames: ["kim.jh"],
      }),
    ).toBeNull();
  });

  it("검색어가 비어 있으면 보이지 않는다", () => {
    expect(
      getGuestAddOption({ query: "   ", playersStatus: "ready", existingUsernames: [] }),
    ).toBeNull();
  });

  it("회원 목록을 받기 전이거나 받지 못했으면 보이지 않는다", () => {
    expect(
      getGuestAddOption({ query: "mina", playersStatus: "loading", existingUsernames: [] }),
    ).toBeNull();
    expect(
      getGuestAddOption({ query: "mina", playersStatus: "error", existingUsernames: [] }),
    ).toBeNull();
  });

  it.each(["미나", "mina k", ".mina", "mina..k", "a".repeat(65)])(
    "아이디 형식이 아니면(%s) 눌리지 않는 줄로 보인다",
    (query) => {
      expect(
        getGuestAddOption({ query, playersStatus: "ready", existingUsernames: [] }),
      ).toEqual({ username: query.trim(), isValid: false });
    },
  );
});
