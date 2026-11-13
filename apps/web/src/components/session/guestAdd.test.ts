import { describe, expect, it } from "vitest";
import { getGuestAddOption } from "./guestAdd";

describe("getGuestAddOption", () => {
  it("회원 목록을 받았고 검색 결과가 없으면 앞뒤 공백을 뗀 검색어로 추가 줄을 보인다", () => {
    expect(
      getGuestAddOption({
        query: "  mina.k ",
        playersStatus: "ready",
        resultCount: 0,
      }),
    ).toEqual({ username: "mina.k", isValid: true });
  });

  it("검색 결과가 있거나 검색어가 비어 있으면 보이지 않는다", () => {
    expect(
      getGuestAddOption({ query: "mina", playersStatus: "ready", resultCount: 1 }),
    ).toBeNull();
    expect(
      getGuestAddOption({ query: "   ", playersStatus: "ready", resultCount: 0 }),
    ).toBeNull();
  });

  it("회원 목록을 받기 전이거나 받지 못했으면 보이지 않는다", () => {
    expect(
      getGuestAddOption({ query: "mina", playersStatus: "loading", resultCount: 0 }),
    ).toBeNull();
    expect(
      getGuestAddOption({ query: "mina", playersStatus: "error", resultCount: 0 }),
    ).toBeNull();
  });

  it.each(["미나", "mina k", ".mina", "mina..k", "a".repeat(65)])(
    "아이디 형식이 아니면(%s) 눌리지 않는 줄로 보인다",
    (query) => {
      expect(
        getGuestAddOption({ query, playersStatus: "ready", resultCount: 0 }),
      ).toEqual({ username: query.trim(), isValid: false });
    },
  );
});
