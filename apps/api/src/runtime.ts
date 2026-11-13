/**
 * Supabase Edge Function(Deno 기반 Edge Runtime)에서 실행 중인지 판별한다.
 * Edge Runtime은 상주 프로세스가 없어 부팅 작업·interval을 요청마다 반복하지 않도록 이 값으로 분기한다.
 */
export const isEdgeRuntime = (): boolean => {
  const runtime = globalThis as { EdgeRuntime?: unknown; Deno?: unknown };
  return runtime.EdgeRuntime !== undefined || runtime.Deno !== undefined;
};

/**
 * Edge Runtime의 `EdgeRuntime.waitUntil`. 응답 뒤에도 함수가 끝나기 전에 작업을 마치게 한다.
 * Node처럼 상주 프로세스면 없어도 되므로 undefined를 돌려준다.
 */
export const getRuntimeWaitUntil = ():
  | ((task: Promise<unknown>) => void)
  | undefined => {
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil?: (task: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  const waitUntil = runtime?.waitUntil;
  return typeof waitUntil === "function"
    ? (task) => waitUntil.call(runtime, task)
    : undefined;
};

const FUNCTIONS_PATH_PREFIX = "/functions/v1";

/**
 * Edge Function은 `<base>/functions/v1/api/...` 요청을 `/api/...` pathname으로 받으므로 Express 라우트와 그대로 맞는다.
 * 게이트웨이를 거치지 않는 호출 등으로 `/functions/v1` 접두사가 남아 있으면 떼어 낸다.
 */
export const normalizeEdgeRequestUrl = (url: string): string => {
  const hasPrefix =
    url === FUNCTIONS_PATH_PREFIX ||
    url.startsWith(`${FUNCTIONS_PATH_PREFIX}/`) ||
    url.startsWith(`${FUNCTIONS_PATH_PREFIX}?`);
  if (!hasPrefix) return url;
  const stripped = url.slice(FUNCTIONS_PATH_PREFIX.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
};
