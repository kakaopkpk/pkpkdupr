import {
  PlayerRepository,
  type DeletePlayerWithoutMatchesResult,
  type StoredPlayerRecord,
} from "@pkpkdupr/db";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { db } from "../db";
import { app } from "../index";
import { MatchRepository } from "../repositories/MatchRepository";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";
import { SupabaseAuthAdmin } from "../services/supabaseAuthAdmin";

const NOW = new Date("2026-11-17T10:00:00+09:00");

const storedPlayer = (
  id: string,
  overrides: Partial<StoredPlayerRecord> = {},
): StoredPlayerRecord => ({
  id,
  username: id,
  gender: "M",
  status: "active",
  isGuest: false,
  duprRating: null,
  authUserId: null,
  isFirstLogin: false,
  guestAddedByPlayerId: null,
  guestAddedSessionId: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const admin = storedPlayer("Padmin01", { authUserId: "auth-admin" });
const member = storedPlayer("Pmember1", {
  authUserId: "auth-member",
  isFirstLogin: true,
});
const guest = storedPlayer("Pguest01", {
  gender: null,
  isGuest: true,
  guestAddedByPlayerId: member.id,
  guestAddedSessionId: "Scustom1",
});

const sessionOf = (player: StoredPlayerRecord): AuthenticatedSession => ({
  payload: { playerId: player.id, isAdmin: player.id === admin.id },
  player,
  isFirstLogin: false,
});

let session: AuthenticatedSession;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  session = sessionOf(admin);
  vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockImplementation(
    async () => session,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/admin/players", () => {
  it("계정 상태·경기 수·최근 경기 시각을 함께 돌려준다", async () => {
    const lastMatchStartsAt = new Date("2026-11-16T19:00:00+09:00");
    vi.spyOn(db.players, "findAll").mockResolvedValue([admin, member, guest]);
    vi.spyOn(db.matches, "countRatingExcludedMatchesByPlayerId").mockResolvedValue(
      { [guest.id]: 1 },
    );
    const findMatchStats = vi
      .spyOn(db.matches, "findMatchStatsByPlayerId")
      .mockResolvedValue({
        [member.id]: { matchCount: 3, lastMatchStartsAt },
        [guest.id]: { matchCount: 1, lastMatchStartsAt },
      });
    vi.spyOn(db.matches, "findSessionById").mockResolvedValue(undefined);

    const response = await request(app)
      .get("/api/admin/players")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(findMatchStats).toHaveBeenCalledTimes(1);
    const byId = new Map(
      (response.body as Array<Record<string, unknown>>).map((player) => [
        player.id,
        player,
      ]),
    );
    expect(byId.get(admin.id)).toMatchObject({
      isFirstLogin: false,
      hasLoginAccount: true,
      matchCount: 0,
      lastMatchStartsAt: null,
    });
    expect(byId.get(member.id)).toMatchObject({
      isFirstLogin: true,
      hasLoginAccount: true,
      matchCount: 3,
      lastMatchStartsAt: lastMatchStartsAt.toISOString(),
    });
    expect(byId.get(guest.id)).toMatchObject({
      hasLoginAccount: false,
      matchCount: 1,
      ratingExcludedMatchCount: 1,
    });
    expect(byId.get(member.id)).not.toHaveProperty("authUserId");
  });
});

describe("DELETE /api/admin/players/:playerId", () => {
  let deletePlayer: MockInstance<PlayerRepository["deletePlayerWithoutMatches"]>;
  let deleteAuthUser: MockInstance<SupabaseAuthAdmin["deleteUser"]>;
  let notifySessionsChanged: MockInstance<
    MatchRepository["notifySessionsChanged"]
  >;

  const mockDeleteResult = (result: DeletePlayerWithoutMatchesResult) =>
    deletePlayer.mockResolvedValue(result);

  beforeEach(() => {
    deletePlayer = vi.spyOn(db.players, "deletePlayerWithoutMatches");
    deleteAuthUser = vi
      .spyOn(SupabaseAuthAdmin.prototype, "deleteUser")
      .mockResolvedValue();
    notifySessionsChanged = vi
      .spyOn(MatchRepository.prototype, "notifySessionsChanged")
      .mockImplementation(() => undefined);
  });

  const remove = (playerId: string) =>
    request(app)
      .delete(`/api/admin/players/${playerId}`)
      .set("Authorization", "Bearer token");

  it("경기 없는 정회원을 지우면 204이고 Auth 사용자 삭제와 세션 변경 알림을 부른다", async () => {
    mockDeleteResult({
      status: "deleted",
      authUserId: "auth-member",
      sessionIds: ["Scustom1"],
    });

    const response = await remove(member.id);

    expect(response.status).toBe(204);
    expect(deletePlayer).toHaveBeenCalledWith(member.id);
    expect(deleteAuthUser).toHaveBeenCalledWith("auth-member");
    expect(notifySessionsChanged).toHaveBeenCalledWith(["Scustom1"]);
  });

  it("경기 없는 게스트는 Auth 호출 없이 지운다", async () => {
    mockDeleteResult({ status: "deleted", authUserId: null, sessionIds: [] });

    const response = await remove(guest.id);

    expect(response.status).toBe(204);
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it("Auth 사용자 삭제가 실패해도 로그만 남기고 204다", async () => {
    mockDeleteResult({
      status: "deleted",
      authUserId: "auth-member",
      sessionIds: [],
    });
    deleteAuthUser.mockRejectedValue(new Error("auth down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await remove(member.id);

    expect(response.status).toBe(204);
    expect(consoleError).toHaveBeenCalled();
  });

  it("경기 행이 있으면 409이고 Auth 사용자를 지우지 않는다", async () => {
    mockDeleteResult({ status: "has_matches" });

    const response = await remove(member.id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "경기 기록이 있는 회원은 지울 수 없어요. 비활성으로 바꾸세요.",
    });
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(notifySessionsChanged).not.toHaveBeenCalled();
  });

  it("관리자 계정이면 409다", async () => {
    mockDeleteResult({ status: "admin" });

    const response = await remove("Padmin02");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "관리자 계정은 지울 수 없어요." });
  });

  it("자기 자신이면 400이고 DB를 건드리지 않는다", async () => {
    const response = await remove(admin.id);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "자기 자신은 지울 수 없어요." });
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("없는 회원이면 404다", async () => {
    mockDeleteResult({ status: "not_found" });

    const response = await remove("Pmissing");

    expect(response.status).toBe(404);
  });

  it("관리자가 아니면 403이다", async () => {
    session = sessionOf(member);

    const response = await remove(guest.id);

    expect(response.status).toBe(403);
    expect(deletePlayer).not.toHaveBeenCalled();
  });
});

describe("PlayerRepository.deletePlayerWithoutMatches", () => {
  const createRepository = (options: {
    playerRows?: Record<string, unknown>[];
    adminRows?: Record<string, unknown>[];
    matchRows?: Record<string, unknown>[];
    sessionRows?: Record<string, unknown>[];
  }) => {
    const statements: string[] = [];
    const execute = vi.fn(
      async (statement: string | { sql: string; args?: unknown[] }) => {
        const sql = typeof statement === "string" ? statement : statement.sql;
        statements.push(sql.replace(/\s+/g, " ").trim());
        if (sql.includes("FROM players")) {
          return { rows: options.playerRows ?? [], rowsAffected: 0 };
        }
        if (sql.includes("FROM player_admins")) {
          return { rows: options.adminRows ?? [], rowsAffected: 0 };
        }
        if (sql.includes("FROM match_participants")) {
          return { rows: options.matchRows ?? [], rowsAffected: 0 };
        }
        if (sql.includes("DELETE FROM match_session_participants")) {
          const rows = options.sessionRows ?? [];
          return { rows, rowsAffected: rows.length };
        }
        return { rows: [], rowsAffected: 1 };
      },
    );
    const transaction = {
      execute,
      commit: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
    const client = { transaction: vi.fn(async () => transaction) };
    const repository = new PlayerRepository({}, client as any);
    return { repository, transaction, statements };
  };

  it("경기 행이 없으면 세션 참여·회원별 행·회원을 한 트랜잭션에서 지운다", async () => {
    const { repository, transaction, statements } = createRepository({
      playerRows: [{ id: "Pmember1", auth_user_id: "auth-member" }],
      sessionRows: [{ session_id: "Scustom1" }, { session_id: "Scustom1" }],
    });

    const result = await repository.deletePlayerWithoutMatches("Pmember1");

    expect(result).toEqual({
      status: "deleted",
      authUserId: "auth-member",
      sessionIds: ["Scustom1"],
    });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.close).not.toHaveBeenCalled();
    const lockIndex = statements.findIndex((sql) =>
      sql.startsWith("LOCK TABLE match_participants"),
    );
    const matchCheckIndex = statements.findIndex((sql) =>
      sql.includes("FROM match_participants WHERE player_id"),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(matchCheckIndex);
    for (const table of [
      "match_session_participants",
      "player_creation_logs",
      "player_status_change_logs",
      "player_rating_change_logs",
      "player_rating_chart_projections",
      "player_rating_chart_points",
      "official_dupr_adjustment_logs",
    ]) {
      expect(statements).toContainEqual(
        expect.stringContaining(`DELETE FROM ${table} WHERE player_id = $1`),
      );
    }
    expect(statements.at(-1)).toBe("DELETE FROM players WHERE id = $1");
  });

  it("경기 행이 있으면 아무것도 지우지 않는다", async () => {
    const { repository, statements } = createRepository({
      playerRows: [{ id: "Pmember1", auth_user_id: null }],
      matchRows: [{ "?column?": 1 }],
    });

    const result = await repository.deletePlayerWithoutMatches("Pmember1");

    expect(result).toEqual({ status: "has_matches" });
    expect(statements.some((sql) => sql.startsWith("DELETE"))).toBe(false);
  });

  it("관리자거나 없는 회원이면 지우지 않는다", async () => {
    const adminCase = createRepository({
      playerRows: [{ id: "Padmin01", auth_user_id: "auth-admin" }],
      adminRows: [{ "?column?": 1 }],
    });
    const missingCase = createRepository({});

    expect(
      await adminCase.repository.deletePlayerWithoutMatches("Padmin01"),
    ).toEqual({ status: "admin" });
    expect(
      await missingCase.repository.deletePlayerWithoutMatches("Pmissing"),
    ).toEqual({ status: "not_found" });
    expect(
      [...adminCase.statements, ...missingCase.statements].some((sql) =>
        sql.startsWith("DELETE"),
      ),
    ).toBe(false);
  });
});
