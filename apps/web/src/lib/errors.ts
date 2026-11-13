/**
 * 요청이 서버에 닿지 못한 실패인지. 오프라인이거나 fetch 자체가 실패(TypeError)했거나
 * Supabase Auth가 재시도 가능한 네트워크 오류(AuthRetryableFetchError)를 던진 경우다.
 * 서버가 돌려준 4xx·5xx 오류는 false다.
 */
export const isNetworkError = (err: unknown): boolean => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (err instanceof TypeError) {
    return true;
  }
  return err instanceof Error && err.name === "AuthRetryableFetchError";
};

/** 네트워크 오류면 "인터넷 연결을 확인해 주세요", 아니면 fallback. err.message는 쓰지 않는다 */
export const getUserErrorMessage = (err: unknown, fallback: string): string =>
  isNetworkError(err) ? "인터넷 연결을 확인해 주세요" : fallback;
