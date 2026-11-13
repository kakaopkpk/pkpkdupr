import { afterEach, describe, expect, it, vi } from "vitest";
import { getUserErrorMessage, isNetworkError } from "./errors";

const authRetryableError = () => {
  const error = new Error("Failed to fetch");
  error.name = "AuthRetryableFetchError";
  return error;
};

describe("isNetworkError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 실패(TypeError)와 Supabase Auth 재시도 오류는 네트워크 오류다", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(authRetryableError())).toBe(true);
  });

  it("서버가 돌려준 오류는 온라인이면 네트워크 오류가 아니다", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNetworkError(new Error("이미 지워진 경기예요"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it("오프라인이면 오류 종류와 상관없이 네트워크 오류다", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkError(new Error("서버 오류"))).toBe(true);
  });
});

describe("getUserErrorMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("네트워크 오류면 연결 확인 문구를 돌려준다", () => {
    expect(
      getUserErrorMessage(new TypeError("Load failed"), "랭킹을 불러오지 못했어요"),
    ).toBe("인터넷 연결을 확인해 주세요");
  });

  it("그 밖의 오류는 err.message 대신 fallback을 돌려준다", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(
      getUserErrorMessage(new Error("Internal Server Error"), "랭킹을 불러오지 못했어요"),
    ).toBe("랭킹을 불러오지 못했어요");
  });
});
