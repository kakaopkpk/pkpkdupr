import { vi } from "vitest";

/** 테스트용 RSA 키로 만든 서비스 계정 JSON 문자열 */
export const createTestServiceAccountJson = async (): Promise<string> => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  let binary = "";
  for (const byte of pkcs8) {
    binary += String.fromCharCode(byte);
  }
  const body = btoa(binary).replace(/(.{64})/g, "$1\n");
  return JSON.stringify({
    type: "service_account",
    client_email: "calendar-bot@test-project.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    token_uri: "https://oauth2.googleapis.com/token",
  });
};

export interface RecordedCalendarCall {
  method: string;
  url: string;
  body: unknown;
}

/**
 * 구글 토큰·캘린더 API를 흉내 내는 fetch.
 * calendarResponder로 캘린더 호출별 상태 코드를 정하고, 토큰 요청은 항상 성공한다.
 */
export const createFakeGoogleFetch = (
  calendarResponder: (call: RecordedCalendarCall) => number = () => 200,
) => {
  const calendarCalls: RecordedCalendarCall[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
        return new Response(
          JSON.stringify({ access_token: "fake-token", expires_in: 3600 }),
          { status: 200 },
        );
      }
      const call: RecordedCalendarCall = {
        method: init?.method ?? "GET",
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calendarCalls.push(call);
      const status = calendarResponder(call);
      return new Response(status === 204 ? null : "{}", { status });
    },
  );
  return { fetchMock, calendarCalls, tokenRequests };
};
