import { apiFetch } from "../lib/api";

const NETWORK_ERROR_MESSAGE =
  "네트워크에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const DEFAULT_ERROR_MESSAGE = "요청을 처리하지 못했어요.";

/** `status`는 HTTP 상태이며 0이면 네트워크 실패다. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 400~499 응답이면 true(네트워크 실패·5xx는 false). */
export const isClientError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

export interface ApiJsonInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 주면 JSON으로 보낸다. */
  body?: unknown;
}

/**
 * API를 호출해 JSON 본문을 돌려준다. 204면 undefined를 돌려주고,
 * 2xx가 아니면 응답 `{ error }`를 message로 가진 ApiError를 던진다.
 */
export const apiJson = async <T>(
  path: string,
  init: ApiJsonInit = {},
): Promise<T> => {
  const headers = new Headers();
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await apiFetch(path, {
      method: init.method ?? "GET",
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    const message =
      typeof data?.error === "string" && data.error
        ? data.error
        : DEFAULT_ERROR_MESSAGE;
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};
