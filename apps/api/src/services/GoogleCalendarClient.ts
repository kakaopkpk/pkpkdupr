/**
 * 서비스 계정 하나로 동호회 구글 캘린더의 일정을 쓰는 최소 클라이언트.
 * Node(로컬 dev)와 Deno(Edge Function) 모두에서 돌도록 fetch와 Web Crypto(`crypto.subtle`)만 쓴다.
 */

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const TOKEN_LIFETIME_SECONDS = 3600;
/** 토큰 만료 직전 요청이 실패하지 않도록 이만큼 일찍 새로 받는다 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleCalendarConfig {
  serviceAccount: GoogleServiceAccount;
  calendarId: string;
}

/** 종일 일정은 date, 시각 일정은 dateTime + timeZone */
export type GoogleCalendarEventTime =
  | { date: string }
  | { dateTime: string; timeZone: string };

export interface GoogleCalendarEvent {
  summary: string;
  location: string;
  description: string;
  start: GoogleCalendarEventTime;
  end: GoogleCalendarEventTime;
}

export interface GoogleCalendarClient {
  /** 같은 id 일정이 없으면 만들고, 있거나 지워진 상태면 내용을 통째로 덮어쓰고 되살린다 */
  upsertEvent(eventId: string, event: GoogleCalendarEvent): Promise<void>;
  /** 일정을 지운다. 이미 없거나 지워졌으면 아무것도 하지 않는다 */
  deleteEvent(eventId: string): Promise<void>;
}

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

type FetchLike = typeof fetch;

const isServiceAccount = (value: unknown): value is GoogleServiceAccount => {
  const account = value as Partial<GoogleServiceAccount> | null;
  return (
    typeof account?.client_email === "string" &&
    account.client_email.length > 0 &&
    typeof account.private_key === "string" &&
    account.private_key.length > 0
  );
};

/**
 * env에서 연동 설정을 읽는다. 둘 중 하나라도 없으면 연동을 끈다(null).
 * 서비스 계정 JSON이 깨졌으면 원인을 알리고 끈다.
 */
export const readGoogleCalendarConfig = (
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarConfig | null => {
  const rawServiceAccount = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim();
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  if (!rawServiceAccount || !calendarId) {
    return null;
  }
  let serviceAccount: unknown;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    serviceAccount = undefined;
  }
  if (!isServiceAccount(serviceAccount)) {
    console.error(
      "[CALENDAR] GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON이 서비스 계정 JSON 키 형식이 아니라 연동을 끕니다.",
    );
    return null;
  }
  return { serviceAccount, calendarId };
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeJsonBase64Url = (value: unknown) =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** PKCS#8 PEM("-----BEGIN PRIVATE KEY-----") 본문을 DER 바이트로 바꾼다 */
const pemToDer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    // env에 넣으며 줄바꿈이 "\n" 문자열로 남은 경우도 받는다
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    der[index] = binary.charCodeAt(index);
  }
  return der.buffer;
};

/** 서비스 계정 OAuth 2.0 JWT(RS256) 어서션을 만든다 */
export const createServiceAccountAssertion = async (
  serviceAccount: GoogleServiceAccount,
  now: Date,
): Promise<string> => {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const unsigned = `${encodeJsonBase64Url({ alg: "RS256", typ: "JWT" })}.${encodeJsonBase64Url({
    iss: serviceAccount.client_email,
    scope: CALENDAR_EVENTS_SCOPE,
    aud: serviceAccount.token_uri ?? DEFAULT_TOKEN_URI,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
};

const readErrorBody = async (response: Response) => {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
};

const isGoneStatus = (status: number) => status === 404 || status === 410;

/** Deno는 읽지 않은 응답 본문이 자원을 붙잡으므로 쓰지 않는 본문도 비운다 */
const discardBody = async (response: Response) => {
  try {
    await response.text();
  } catch {
    // 본문을 못 읽어도 결과 판정에는 영향이 없다
  }
};

/**
 * 패치는 하위 객체를 병합하므로, 종일↔시각 일정이 바뀌어도 이전 필드가 남지 않게 반대쪽 필드를 null로 지운다.
 */
const toPatchTime = (time: GoogleCalendarEventTime) =>
  "date" in time
    ? { date: time.date, dateTime: null, timeZone: null }
    : { date: null, dateTime: time.dateTime, timeZone: time.timeZone };

export const createGoogleCalendarClient = (
  config: GoogleCalendarConfig,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): GoogleCalendarClient => {
  const { serviceAccount, calendarId } = config;
  const eventsUrl = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  let cachedToken: { value: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  const requestAccessToken = async (): Promise<string> => {
    const assertion = await createServiceAccountAssertion(
      serviceAccount,
      new Date(),
    );
    const response = await fetchImpl(
      serviceAccount.token_uri ?? DEFAULT_TOKEN_URI,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: JWT_BEARER_GRANT_TYPE,
          assertion,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new GoogleCalendarApiError(
        `구글 액세스 토큰 발급 실패(${response.status}): ${await readErrorBody(response)}`,
        response.status,
      );
    }
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) {
      throw new GoogleCalendarApiError("구글 액세스 토큰 응답이 비어 있습니다.", 500);
    }
    cachedToken = {
      value: body.access_token,
      expiresAt:
        Date.now() +
        (body.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000 -
        TOKEN_REFRESH_MARGIN_MS,
    };
    return body.access_token;
  };

  const getAccessToken = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.value;
    }
    // 동시에 여러 일정을 쓸 때 토큰은 한 번만 받는다
    pendingToken ??= requestAccessToken().finally(() => {
      pendingToken = null;
    });
    return await pendingToken;
  };

  const callCalendar = async (
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> => {
    const token = await getAccessToken();
    return await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  const fail = async (action: string, response: Response) =>
    new GoogleCalendarApiError(
      `구글 캘린더 일정 ${action} 실패(${response.status}): ${await readErrorBody(response)}`,
      response.status,
    );

  return {
    async upsertEvent(eventId, event) {
      const inserted = await callCalendar("POST", eventsUrl, {
        id: eventId,
        ...event,
      });
      if (inserted.ok) {
        await discardBody(inserted);
        return;
      }
      if (inserted.status !== 409) {
        throw await fail("만들기", inserted);
      }
      await discardBody(inserted);
      // 같은 id가 이미 있다(지워진 일정 포함). 내용을 덮어쓰고 status로 되살린다.
      const patched = await callCalendar(
        "PATCH",
        `${eventsUrl}/${encodeURIComponent(eventId)}`,
        {
          ...event,
          start: toPatchTime(event.start),
          end: toPatchTime(event.end),
          status: "confirmed",
        },
      );
      if (!patched.ok && !isGoneStatus(patched.status)) {
        throw await fail("고치기", patched);
      }
      await discardBody(patched);
    },
    async deleteEvent(eventId) {
      const deleted = await callCalendar(
        "DELETE",
        `${eventsUrl}/${encodeURIComponent(eventId)}`,
      );
      if (!deleted.ok && !isGoneStatus(deleted.status)) {
        throw await fail("지우기", deleted);
      }
      await discardBody(deleted);
    },
  };
};
