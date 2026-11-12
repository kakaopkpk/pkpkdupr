/**
 * 요청이 서버에 닿지 못한 실패인지. 오프라인이거나 fetch 자체가 실패(TypeError)했거나
 * Supabase Auth가 재시도 가능한 네트워크 오류를 던진 경우다.
 * 서버가 돌려준 4xx·5xx 오류는 false다(화면 안에 인라인으로 보인다).
 */
export const isNetworkSaveFailure = (error: unknown): boolean => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return error instanceof Error && error.name === "AuthRetryableFetchError";
};

export const getSaveErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
