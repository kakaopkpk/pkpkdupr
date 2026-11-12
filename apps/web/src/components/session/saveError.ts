/**
 * 요청이 서버에 닿지 못한 실패인지. fetch 자체 실패는 TypeError이고,
 * 서버가 돌려준 오류는 lib/matchSessions의 requestJson이 서버 문구로 Error를 던진다.
 */
export const isNetworkError = (err: unknown): boolean =>
  err instanceof TypeError ||
  (typeof navigator !== "undefined" && navigator.onLine === false);

export const getErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;
