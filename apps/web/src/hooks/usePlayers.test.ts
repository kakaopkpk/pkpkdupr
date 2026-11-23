import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
// 훅이 읽는 AuthContext가 Supabase 환경변수를 요구하므로 모듈 함수 테스트에서는 대체한다
vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { ensureOwner, fetchPlayers, getSnapshot } from "@/hooks/usePlayers";

const mockedFetch = vi.mocked(apiFetch);

const makeMember = (id: string) => ({ id, username: id });

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

const failResponse = (status: number) =>
  ({ ok: false, status }) as unknown as Response;

let ownerSeq = 0;
let ownerId = "";

beforeEach(() => {
  mockedFetch.mockReset();
  // 모듈 상태는 계정이 바뀌면 버려지므로 테스트마다 새 계정으로 시작한다
  ownerSeq += 1;
  ownerId = `owner-${ownerSeq}`;
  ensureOwner(ownerId);
});

describe("usePlayers 상태 전이", () => {
  it("캐시가 없으면 loading·error null로 시작한다", () => {
    expect(getSnapshot()).toMatchObject({
      status: "loading",
      players: [],
      error: null,
    });
  });

  it("성공하면 ready가 되고 error는 null이다", async () => {
    mockedFetch.mockResolvedValueOnce(okResponse([makeMember("a")]));

    await fetchPlayers(ownerId);

    expect(getSnapshot()).toMatchObject({ status: "ready", error: null });
    expect(getSnapshot().players).toHaveLength(1);
  });

  it("목록이 빈 채 실패하면 error 상태로 실패 원인을 보관한다", async () => {
    const cause = new TypeError("Failed to fetch");
    mockedFetch.mockRejectedValueOnce(cause);

    await fetchPlayers(ownerId);

    expect(getSnapshot().status).toBe("error");
    expect(getSnapshot().error).toBe(cause);
  });

  it("서버 오류 응답도 error 상태가 된다", async () => {
    mockedFetch.mockResolvedValueOnce(failResponse(500));

    await fetchPlayers(ownerId);

    expect(getSnapshot().status).toBe("error");
    expect(getSnapshot().error).toBeInstanceOf(Error);
  });

  it("실패 상태에서 재요청을 시작하면 loading·error null이 되고, 성공하면 ready가 된다", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await fetchPlayers(ownerId);
    expect(getSnapshot().status).toBe("error");

    let resolveRetry: (res: Response) => void = () => {};
    mockedFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRetry = resolve;
      }),
    );
    const retry = fetchPlayers(ownerId);

    expect(getSnapshot()).toMatchObject({ status: "loading", error: null });

    resolveRetry(okResponse([makeMember("a")]));
    await retry;

    expect(getSnapshot()).toMatchObject({ status: "ready", error: null });
  });

  it("다시 시도가 또 실패하면 새 원인으로 error 상태가 된다", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("first"));
    await fetchPlayers(ownerId);

    const second = new TypeError("second");
    mockedFetch.mockRejectedValueOnce(second);
    await fetchPlayers(ownerId);

    expect(getSnapshot().status).toBe("error");
    expect(getSnapshot().error).toBe(second);
  });

  it("진행 중 요청은 공유해 연타해도 한 번만 요청한다", async () => {
    mockedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await fetchPlayers(ownerId);

    let resolveRetry: (res: Response) => void = () => {};
    mockedFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRetry = resolve;
      }),
    );
    const first = fetchPlayers(ownerId);
    const second = fetchPlayers(ownerId);
    const third = fetchPlayers(ownerId);

    expect(second).toBe(first);
    expect(third).toBe(first);
    // 실패 때의 1회 + 다시 시도 1회
    expect(mockedFetch).toHaveBeenCalledTimes(2);

    resolveRetry(okResponse([]));
    await first;
  });

  it("이미 보여 줄 목록이 있으면 재조회가 실패해도 목록을 두고 실패 표시를 하지 않는다", async () => {
    mockedFetch.mockResolvedValueOnce(okResponse([makeMember("a")]));
    await fetchPlayers(ownerId);

    mockedFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await fetchPlayers(ownerId);

    expect(getSnapshot()).toMatchObject({ status: "ready", error: null });
    expect(getSnapshot().players).toHaveLength(1);
  });
});
