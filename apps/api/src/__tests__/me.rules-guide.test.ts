import { PlayerRepository, players } from "@pkpkdupr/db";
import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";

const NOW = new Date("2026-11-26T09:00:00.000Z");
const alice: Player = {
  isGuest: false,
  id: "Palice01",
  username: "alice",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const authSession: AuthenticatedSession = {
  payload: { playerId: alice.id, isAdmin: false },
  player: alice,
  isFirstLogin: false,
};

/** drizzle 조건(SQL 조각 트리)에 그 컬럼과 글자가 들어 있는지 */
const containsChunk = (
  node: unknown,
  predicate: (value: unknown) => boolean,
  seen = new Set<unknown>(),
): boolean => {
  if (predicate(node)) return true;
  if (!node || typeof node !== "object" || seen.has(node)) return false;
  seen.add(node);
  return Object.values(node).some((value) =>
    containsChunk(value, predicate, seen),
  );
};

describe("PlayerRepository.markRulesGuideCompleted", () => {
  it("아직 완독 시각이 없는 회원만 지금 시각으로 쓴다(이미 있으면 처음 시각 유지)", async () => {
    const set = vi.fn();
    const where = vi.fn().mockResolvedValue(undefined);
    const fakeDb = {
      update: vi.fn(() => ({
        set: (values: unknown) => {
          set(values);
          return { where };
        },
      })),
    };

    await new PlayerRepository(fakeDb).markRulesGuideCompleted(alice.id, NOW);

    expect(fakeDb.update).toHaveBeenCalledWith(players);
    // updated_at은 바꾸지 않는다
    expect(set).toHaveBeenCalledWith({ rulesGuideCompletedAt: NOW });
    const condition = where.mock.calls[0][0];
    expect(
      containsChunk(condition, (value) => value === players.rulesGuideCompletedAt),
    ).toBe(true);
    expect(
      containsChunk(
        condition,
        (value) => typeof value === "string" && value.includes("is null"),
      ),
    ).toBe(true);
    expect(containsChunk(condition, (value) => value === alice.id)).toBe(true);
  });
});

describe("POST /api/me/rules-guide/complete", () => {
  beforeEach(() => {
    vi.spyOn(
      AuthService.prototype,
      "authenticateAccessToken",
    ).mockResolvedValue(authSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("요청자의 완독을 남기고 204이며, 다시 불러도 같은 결과다", async () => {
    const mark = vi
      .spyOn(PlayerRepository.prototype, "markRulesGuideCompleted")
      .mockResolvedValue();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app)
        .post("/api/me/rules-guide/complete")
        .set("Authorization", "Bearer test-token");
      expect(response.status).toBe(204);
    }

    expect(mark).toHaveBeenCalledTimes(2);
    expect(mark).toHaveBeenNthCalledWith(1, alice.id, expect.any(Date));
    expect(mark).toHaveBeenNthCalledWith(2, alice.id, expect.any(Date));
  });

  it("토큰이 없으면 401이고 저장하지 않는다", async () => {
    vi.restoreAllMocks();
    const mark = vi.spyOn(
      PlayerRepository.prototype,
      "markRulesGuideCompleted",
    );

    const response = await request(app).post("/api/me/rules-guide/complete");

    expect(response.status).toBe(401);
    expect(mark).not.toHaveBeenCalled();
  });

  it("저장이 실패하면 500이다", async () => {
    vi.spyOn(
      PlayerRepository.prototype,
      "markRulesGuideCompleted",
    ).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app)
      .post("/api/me/rules-guide/complete")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(500);
  });
});
