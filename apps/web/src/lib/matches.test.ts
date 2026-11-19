import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { startScheduledMatch } from "@/lib/matches";

const mockedApiFetch = vi.mocked(apiFetch);

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("startScheduledMatch", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("POST /api/matches/:matchId/start를 부르고 응답 경기를 돌려준다", async () => {
    mockedApiFetch.mockResolvedValue(
      jsonResponse(200, { id: "M 1", status: "created" }),
    );

    await expect(startScheduledMatch("M 1")).resolves.toMatchObject({
      id: "M 1",
      status: "created",
    });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/matches/M%201/start", {
      method: "POST",
    });
  });

  it("실패하면 서버 문구로 Error를 던진다", async () => {
    mockedApiFetch.mockResolvedValue(
      jsonResponse(409, { error: "kim님이 다른 경기 중이에요" }),
    );

    await expect(startScheduledMatch("M1")).rejects.toThrow(
      "kim님이 다른 경기 중이에요",
    );
  });

  it("서버 문구가 없으면 기본 문구로 Error를 던진다", async () => {
    mockedApiFetch.mockResolvedValue(new Response("", { status: 500 }));

    await expect(startScheduledMatch("M1")).rejects.toThrow(
      "경기를 시작하지 못했어요.",
    );
  });
});
