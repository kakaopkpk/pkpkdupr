import { INTERNAL_EMAIL_DOMAIN, toInternalEmail } from "@pkpkdupr/shared/auth";
import type { StoredPlayerRecord } from "@pkpkdupr/db";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { app } from "../index";
import { AuthService } from "../services/AuthService";
import {
  AuthEmailExistsError,
  generateInitialPassword,
  SupabaseAuthAdmin,
} from "../services/supabaseAuthAdmin";
import { SupabaseAuthUserVerifier } from "../services/supabaseAuthUser";

const NOW = new Date("2026-11-10T00:00:00.000Z");

interface FakeAuthAccount {
  email: string;
  password: string;
}

/**
 * Supabase Auth(토큰 확인·service role 관리 API)와 DB 저장소를 메모리로 대신한다.
 * Auth 이메일 중복과 lower(username) unique 제약은 실제 동작과 같게 흉내 낸다.
 */
const setupAuthFixture = () => {
  const tokens = new Map<string, string>();
  const authAccounts = new Map<string, FakeAuthAccount>();
  const players = new Map<string, StoredPlayerRecord>();
  const admins = new Set<string>();
  let nextAuthUserNumber = 1;

  const addAuthUser = (
    token: string,
    email = `${token}@${INTERNAL_EMAIL_DOMAIN}`,
  ) => {
    const id = `auth-${token}`;
    tokens.set(token, id);
    authAccounts.set(id, { email, password: "current-password" });
    return { id };
  };

  const addPlayer = (
    id: string,
    username: string,
    authUserId: string | null = null,
  ): StoredPlayerRecord => {
    const player: StoredPlayerRecord = {
      id,
      username,
      gender: "F",
      status: "active",
      duprRating: null,
      authUserId,
      isFirstLogin: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    players.set(id, player);
    return player;
  };

  const findByUsername = (username: string) =>
    [...players.values()].find(
      (player) => player.username.toLowerCase() === username.toLowerCase(),
    );

  const assertEmailFree = (email: string, exceptId?: string) => {
    for (const [id, account] of authAccounts) {
      if (id !== exceptId && account.email === email) {
        throw new AuthEmailExistsError(email);
      }
    }
  };

  vi.spyOn(SupabaseAuthUserVerifier.prototype, "getUser").mockImplementation(
    async (token) => {
      const id = tokens.get(token);
      return id && authAccounts.has(id) ? { id } : null;
    },
  );
  const createAuthUser = vi
    .spyOn(SupabaseAuthAdmin.prototype, "createUser")
    .mockImplementation(async ({ email, password }) => {
      assertEmailFree(email);
      const id = `auth-created-${nextAuthUserNumber++}`;
      authAccounts.set(id, { email, password });
      return id;
    });
  const updateAuthUser = vi
    .spyOn(SupabaseAuthAdmin.prototype, "updateUser")
    .mockImplementation(async (id, input) => {
      const account = authAccounts.get(id);
      if (!account) throw new Error("User not found");
      if (input.email) assertEmailFree(input.email, id);
      Object.assign(account, input);
    });
  const deleteAuthUser = vi
    .spyOn(SupabaseAuthAdmin.prototype, "deleteUser")
    .mockImplementation(async (id) => {
      authAccounts.delete(id);
    });
  vi.spyOn(SupabaseAuthAdmin.prototype, "getUserEmail").mockImplementation(
    async (id) => authAccounts.get(id)?.email ?? null,
  );

  vi.spyOn(db.players, "findById").mockImplementation(async (id) =>
    players.get(id),
  );
  vi.spyOn(db.players, "findByAuthUserId").mockImplementation(
    async (authUserId) =>
      [...players.values()].find((player) => player.authUserId === authUserId),
  );
  vi.spyOn(db.players, "findByUsernameIgnoringCase").mockImplementation(
    async (username) => findByUsername(username),
  );
  const linkAuthUser = vi
    .spyOn(db.players, "linkAuthUser")
    .mockImplementation(async (id, authUserId, isFirstLogin) => {
      const player = players.get(id);
      if (!player || player.authUserId || player.status !== "active") {
        return false;
      }
      player.authUserId = authUserId;
      player.isFirstLogin = isFirstLogin;
      return true;
    });
  vi.spyOn(db.players, "updateFirstLogin").mockImplementation(
    async (id, isFirstLogin) => {
      const player = players.get(id);
      if (player) player.isFirstLogin = isFirstLogin;
      return player;
    },
  );
  const updateUsername = vi
    .spyOn(db.players, "updateUsername")
    .mockImplementation(async (id, username) => {
      const duplicate = findByUsername(username);
      if (duplicate && duplicate.id !== id) {
        throw Object.assign(
          new Error(
            'duplicate key value violates unique constraint "players_username_lower_unique"',
          ),
          { code: "23505" },
        );
      }
      const player = players.get(id);
      if (player) player.username = username;
      return player;
    });
  const createPlayer = vi
    .spyOn(db.players, "create")
    .mockImplementation(async (input) => {
      if (findByUsername(input.username)) {
        throw Object.assign(new Error("duplicate key value"), { code: "23505" });
      }
      const player = addPlayer(input.id, input.username, input.authUserId ?? null);
      player.gender = input.gender;
      player.isFirstLogin = input.isFirstLogin ?? false;
      return player;
    });
  vi.spyOn(db.playerCreationLogs, "create").mockImplementation(
    async (input) => input,
  );
  vi.spyOn(db.playerAdmins, "isAdmin").mockImplementation(async (playerId) =>
    admins.has(playerId),
  );

  return {
    addAuthUser,
    addPlayer,
    admins,
    authAccounts,
    players,
    createAuthUser,
    updateAuthUser,
    deleteAuthUser,
    linkAuthUser,
    updateUsername,
    createPlayer,
  };
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Supabase Auth 기반 인증", () => {
  let fixture: ReturnType<typeof setupAuthFixture>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    fixture = setupAuthFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("세션 확인", () => {
    it("무효·만료 토큰은 SESSION_INVALID로 401을 준다", async () => {
      const response = await request(app).get("/api/me").set(bearer("unknown"));

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    });

    it("Auth 서버를 확인하지 못하면 SESSION_UNAVAILABLE로 503을 준다", async () => {
      vi.spyOn(SupabaseAuthUserVerifier.prototype, "getUser").mockRejectedValue(
        new Error("fetch failed"),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const response = await request(app).get("/api/me").set(bearer("any"));

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("SESSION_UNAVAILABLE");
    });
  });

  describe("Auth 서버 오류 분류", () => {
    /** 응답 본문에 code를 넣지 않는 케이스. 테스트 이름에 그대로 출력된다. */
    const NO_CODE = "(code 없음)";

    /** fixture의 getUser mock을 풀고, Auth 서버 HTTP 응답을 fetch stub으로 대신한다. */
    const stubAuthServerError = (status: number, code: string) => {
      vi.mocked(SupabaseAuthUserVerifier.prototype.getUser).mockRestore();
      vi.stubEnv("SUPABASE_URL", "http://auth.test");
      vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify(code === NO_CODE ? { msg: "error" } : { code, msg: code }),
              {
                status,
                // SDK는 이 헤더가 있어야 응답 본문의 code를 에러 코드로 읽는다(실제 Auth 서버는 항상 보낸다).
                headers: {
                  "Content-Type": "application/json",
                  "X-Supabase-Api-Version": "2024-01-01",
                },
              },
            ),
        ),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it.each([
      [403, "bad_jwt"],
      [403, "session_not_found"],
      [404, "user_not_found"],
      [403, "user_banned"],
      [401, NO_CODE],
    ])(
      "%i %s는 무효 토큰이므로 SESSION_INVALID로 401을 준다",
      async (status, code) => {
        stubAuthServerError(status, code);

        const response = await request(app).get("/api/me").set(bearer("any"));

        expect(response.status).toBe(401);
        expect(response.body.code).toBe("SESSION_INVALID");
      },
    );

    it.each([
      [429, "over_request_rate_limit"],
      [408, "request_timeout"],
      [400, "validation_failed"],
      [403, "unknown_forbidden"],
      [500, "unexpected_failure"],
      [503, NO_CODE],
    ])(
      "%i %s는 토큰 유효성을 판단하지 못한 것이므로 SESSION_UNAVAILABLE로 503을 준다",
      async (status, code) => {
        stubAuthServerError(status, code);

        const response = await request(app).get("/api/me").set(bearer("any"));

        expect(response.status).toBe(503);
        expect(response.body.code).toBe("SESSION_UNAVAILABLE");
      },
    );
  });

  describe("회원 연결", () => {
    it("auth_user_id로 연결된 회원으로 인증하고 isFirstLogin을 준다", async () => {
      const authUser = fixture.addAuthUser("alice");
      fixture.addPlayer("Palice01", "dev_alice", authUser.id).isFirstLogin = true;

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: "Palice01",
        username: "dev_alice",
        isAdmin: false,
        isFirstLogin: true,
      });
      expect(response.body).not.toHaveProperty("authUserId");
    });

    it("연결된 회원이 없으면 같은 username의 미연결 회원이 있어도 연결하지 않고 ACCOUNT_NOT_LINKED를 준다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("alice", `dev_alice@${INTERNAL_EMAIL_DOMAIN}`);

      const [me, players] = await Promise.all([
        request(app).get("/api/me").set(bearer("alice")),
        request(app).get("/api/players").set(bearer("alice")),
      ]);

      for (const response of [me, players]) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "연결된 회원이 없습니다. 관리자에게 문의해주세요.",
          code: "ACCOUNT_NOT_LINKED",
        });
      }
      expect(fixture.linkAuthUser).not.toHaveBeenCalled();
    });

    it("provider·이메일 도메인과 무관하게 연결된 회원이면 통과한다", async () => {
      const authUser = fixture.addAuthUser("legacy", "member@kakaocorp.com");
      fixture.addPlayer("Pmember1", "member", authUser.id);

      const response = await request(app).get("/api/me").set(bearer("legacy"));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("Pmember1");
    });

    it("비활성 회원은 SESSION_INVALID로 거부한다", async () => {
      const authUser = fixture.addAuthUser("alice");
      fixture.addPlayer("Palice01", "dev_alice", authUser.id).status =
        "inactive";

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    });
  });

  describe("첫 로그인 비밀번호 변경", () => {
    it("POST /api/me/password-changed는 isFirstLogin을 해제하고 MeResponse를 준다", async () => {
      const authUser = fixture.addAuthUser("alice");
      fixture.addPlayer("Palice01", "dev_alice", authUser.id).isFirstLogin = true;
      fixture.admins.add("Palice01");

      const response = await request(app)
        .post("/api/me/password-changed")
        .set(bearer("alice"));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: "Palice01",
        isAdmin: true,
        isFirstLogin: false,
      });
      expect(fixture.players.get("Palice01")?.isFirstLogin).toBe(false);
    });

    it("토큰이 없으면 401을 준다", async () => {
      const response = await request(app).post("/api/me/password-changed");

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    });
  });

  describe("관리자 판정", () => {
    it("player_admins에 있는 회원만 관리자다", async () => {
      const adminUser = fixture.addAuthUser("admin");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
      const memberUser = fixture.addAuthUser("member");
      fixture.addPlayer("Pmember1", "member", memberUser.id);

      const [adminMe, memberMe] = await Promise.all([
        request(app).get("/api/me").set(bearer("admin")),
        request(app).get("/api/me").set(bearer("member")),
      ]);

      expect(adminMe.body.isAdmin).toBe(true);
      expect(memberMe.body.isAdmin).toBe(false);
    });

    it("관리자가 아니면 계정 관리 API를 FORBIDDEN으로 거부하고 Auth를 건드리지 않는다", async () => {
      const memberUser = fixture.addAuthUser("member");
      fixture.addPlayer("Pmember1", "member", memberUser.id);
      fixture.addPlayer("Ptarget1", "target");

      const responses = await Promise.all([
        request(app)
          .post("/api/admin/register")
          .set(bearer("member"))
          .send({ username: "new_member", gender: "M" }),
        request(app)
          .post("/api/admin/players/Ptarget1/password-reset")
          .set(bearer("member")),
        request(app)
          .patch("/api/admin/players/Ptarget1/username")
          .set(bearer("member"))
          .send({ username: "renamed" }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "관리자 권한이 필요합니다.",
          code: "FORBIDDEN",
        });
      }
      expect(fixture.createAuthUser).not.toHaveBeenCalled();
      expect(fixture.updateAuthUser).not.toHaveBeenCalled();
    });
  });

  describe("관리자 계정 관리", () => {
    beforeEach(() => {
      const adminUser = fixture.addAuthUser("admin");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
    });

    describe("POST /api/admin/register", () => {
      it("Auth 사용자를 만들어 연결하고 초기 비밀번호를 응답으로만 준다", async () => {
        const response = await request(app)
          .post("/api/admin/register")
          .set(bearer("admin"))
          .send({ username: " New_Member ", gender: "M", password: "ignored" });

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        const { player, initialPassword } = response.body;
        expect(player).toMatchObject({ username: "New_Member", gender: "M" });
        expect(player).not.toHaveProperty("authUserId");
        expect(player).not.toHaveProperty("isFirstLogin");
        expect(initialPassword).toMatch(/^[A-Za-z0-9]{10}$/);
        expect(initialPassword).not.toBe("ignored");

        expect(fixture.createAuthUser).toHaveBeenCalledWith({
          email: `new_member@${INTERNAL_EMAIL_DOMAIN}`,
          password: initialPassword,
        });
        const authUserId = await fixture.createAuthUser.mock.results[0].value;
        expect(fixture.createPlayer).toHaveBeenCalledWith(
          expect.objectContaining({
            username: "New_Member",
            authUserId,
            isFirstLogin: true,
          }),
        );
        expect(fixture.createPlayer.mock.calls[0][0]).not.toHaveProperty(
          "password",
        );
      });

      it("회원 생성이 실패하면 만든 Auth 사용자를 지운다", async () => {
        fixture.createPlayer.mockRejectedValueOnce(new Error("connection lost"));

        const response = await request(app)
          .post("/api/admin/register")
          .set(bearer("admin"))
          .send({ username: "new_member", gender: "F" });

        expect(response.status).toBe(500);
        const authUserId = await fixture.createAuthUser.mock.results[0].value;
        expect(fixture.deleteAuthUser).toHaveBeenCalledWith(authUserId);
        expect(fixture.authAccounts.has(authUserId)).toBe(false);
      });

      it("대소문자만 다른 username은 409로 거부하고 Auth 사용자를 만들지 않는다", async () => {
        fixture.addPlayer("Pmember1", "member");

        const response = await request(app)
          .post("/api/admin/register")
          .set(bearer("admin"))
          .send({ username: "Member", gender: "F" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "중복된 사용자명입니다." });
        expect(fixture.createAuthUser).not.toHaveBeenCalled();
      });

      it("사전 검사 뒤 lower(username) 유니크 위반이 나도 409를 주고 Auth 사용자를 지운다", async () => {
        fixture.createPlayer.mockRejectedValueOnce(
          Object.assign(new Error("duplicate key value"), { code: "23505" }),
        );

        const response = await request(app)
          .post("/api/admin/register")
          .set(bearer("admin"))
          .send({ username: "Member", gender: "F" });

        expect(response.status).toBe(409);
        expect(fixture.deleteAuthUser).toHaveBeenCalledOnce();
      });

      it.each([
        [{ username: "pre_member", gender: "X" }],
        [{ username: "", gender: "M" }],
        [{ username: "김회원", gender: "M" }],
        [{ username: "a".repeat(65), gender: "M" }],
      ])("잘못된 요청 %j는 400을 준다", async (body) => {
        const response = await request(app)
          .post("/api/admin/register")
          .set(bearer("admin"))
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body.error).toEqual(expect.any(String));
        expect(fixture.createAuthUser).not.toHaveBeenCalled();
      });
    });

    describe("POST /api/admin/players/:playerId/password-reset", () => {
      it("연결된 회원은 비밀번호를 바꾸고 이메일을 현재 아이디로 맞춘다", async () => {
        const memberUser = fixture.addAuthUser("member", "member@kakaocorp.com");
        fixture.addPlayer("Pmember1", "Member", memberUser.id);

        const response = await request(app)
          .post("/api/admin/players/Pmember1/password-reset")
          .set(bearer("admin"));

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        const { temporaryPassword } = response.body;
        expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
        expect(fixture.updateAuthUser).toHaveBeenCalledWith(memberUser.id, {
          email: `member@${INTERNAL_EMAIL_DOMAIN}`,
          password: temporaryPassword,
        });
        expect(fixture.createAuthUser).not.toHaveBeenCalled();
        expect(fixture.players.get("Pmember1")?.isFirstLogin).toBe(true);
      });

      it("연결되지 않은 회원은 Auth 사용자를 만들어 연결한다", async () => {
        fixture.addPlayer("Pmember1", "member");

        const response = await request(app)
          .post("/api/admin/players/Pmember1/password-reset")
          .set(bearer("admin"));

        expect(response.status).toBe(200);
        const { temporaryPassword } = response.body;
        expect(fixture.createAuthUser).toHaveBeenCalledWith({
          email: `member@${INTERNAL_EMAIL_DOMAIN}`,
          password: temporaryPassword,
        });
        const authUserId = await fixture.createAuthUser.mock.results[0].value;
        expect(fixture.players.get("Pmember1")).toMatchObject({
          authUserId,
          isFirstLogin: true,
        });
      });

      it("연결하지 못하면 만든 Auth 사용자를 지운다", async () => {
        fixture.addPlayer("Pmember1", "member");
        fixture.linkAuthUser.mockResolvedValueOnce(false);

        const response = await request(app)
          .post("/api/admin/players/Pmember1/password-reset")
          .set(bearer("admin"));

        expect(response.status).toBe(409);
        expect(fixture.deleteAuthUser).toHaveBeenCalledOnce();
      });

      it("없는 회원은 404를 준다", async () => {
        const response = await request(app)
          .post("/api/admin/players/Pnone001/password-reset")
          .set(bearer("admin"));

        expect(response.status).toBe(404);
      });

      it("inactive 회원과 형식에 맞지 않는 아이디의 회원은 400을 준다", async () => {
        fixture.addPlayer("Pinact01", "inactive_member").status = "inactive";
        fixture.addPlayer("Pkorean1", "김회원");

        const responses = await Promise.all([
          request(app)
            .post("/api/admin/players/Pinact01/password-reset")
            .set(bearer("admin")),
          request(app)
            .post("/api/admin/players/Pkorean1/password-reset")
            .set(bearer("admin")),
        ]);

        expect(responses.map((response) => response.status)).toEqual([400, 400]);
        expect(fixture.createAuthUser).not.toHaveBeenCalled();
        expect(fixture.updateAuthUser).not.toHaveBeenCalled();
      });
    });

    describe("PATCH /api/admin/players/:playerId/username", () => {
      it("연결된 회원은 Auth 이메일도 새 아이디로 바꾼다", async () => {
        const memberUser = fixture.addAuthUser("member", toInternalEmail("member"));
        fixture.addPlayer("Pmember1", "member", memberUser.id);

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: " Renamed " });

        expect(response.status).toBe(200);
        expect(response.body.player).toMatchObject({
          id: "Pmember1",
          username: "Renamed",
        });
        expect(fixture.updateAuthUser).toHaveBeenCalledWith(memberUser.id, {
          email: `renamed@${INTERNAL_EMAIL_DOMAIN}`,
        });
        expect(fixture.authAccounts.get(memberUser.id)?.email).toBe(
          `renamed@${INTERNAL_EMAIL_DOMAIN}`,
        );
      });

      it("연결되지 않은 회원은 username만 바꾼다", async () => {
        fixture.addPlayer("Pmember1", "member");

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: "renamed" });

        expect(response.status).toBe(200);
        expect(fixture.players.get("Pmember1")?.username).toBe("renamed");
        expect(fixture.updateAuthUser).not.toHaveBeenCalled();
      });

      it("같은 회원의 대소문자만 바꾸면 허용하고 Auth 이메일은 그대로 둔다", async () => {
        const memberUser = fixture.addAuthUser("member", toInternalEmail("member"));
        fixture.addPlayer("Pmember1", "member", memberUser.id);

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: "Member" });

        expect(response.status).toBe(200);
        expect(fixture.players.get("Pmember1")?.username).toBe("Member");
        expect(fixture.updateAuthUser).not.toHaveBeenCalled();
      });

      it("username 갱신이 실패하면 Auth 이메일을 되돌린다", async () => {
        const memberUser = fixture.addAuthUser("member", toInternalEmail("member"));
        fixture.addPlayer("Pmember1", "member", memberUser.id);
        fixture.updateUsername.mockRejectedValueOnce(new Error("connection lost"));

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: "renamed" });

        expect(response.status).toBe(500);
        expect(fixture.players.get("Pmember1")?.username).toBe("member");
        expect(fixture.authAccounts.get(memberUser.id)?.email).toBe(
          toInternalEmail("member"),
        );
      });

      it("Auth 이메일 갱신이 실패하면 username을 바꾸지 않는다", async () => {
        const memberUser = fixture.addAuthUser("member", toInternalEmail("member"));
        fixture.addPlayer("Pmember1", "member", memberUser.id);
        fixture.updateAuthUser.mockRejectedValueOnce(new Error("auth down"));

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: "renamed" });

        expect(response.status).toBe(500);
        expect(fixture.updateUsername).not.toHaveBeenCalled();
        expect(fixture.players.get("Pmember1")?.username).toBe("member");
      });

      it("다른 회원과 대소문자 구분 없이 같으면 409를 준다", async () => {
        fixture.addPlayer("Pmember1", "member");
        fixture.addPlayer("Pother01", "other");

        const response = await request(app)
          .patch("/api/admin/players/Pmember1/username")
          .set(bearer("admin"))
          .send({ username: "OTHER" });

        expect(response.status).toBe(409);
        expect(fixture.updateUsername).not.toHaveBeenCalled();
      });

      it("없는 회원은 404, 형식이 맞지 않으면 400을 준다", async () => {
        fixture.addPlayer("Pmember1", "member");

        const responses = await Promise.all([
          request(app)
            .patch("/api/admin/players/Pnone001/username")
            .set(bearer("admin"))
            .send({ username: "renamed" }),
          request(app)
            .patch("/api/admin/players/Pmember1/username")
            .set(bearer("admin"))
            .send({ username: "re named" }),
          request(app)
            .patch("/api/admin/players/Pmember1/username")
            .set(bearer("admin"))
            .send({}),
        ]);

        expect(responses.map((response) => response.status)).toEqual([
          404, 400, 400,
        ]);
      });
    });
  });
});

describe("generateInitialPassword", () => {
  it("헷갈리는 문자 없이 영문과 숫자를 각각 1자 이상 넣은 10자다", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateInitialPassword();
      expect(password).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[0O1Il]/);
    }
  });
});

describe("dev mock Auth 계정 시딩", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("active dev mock 회원에게 공통 비밀번호 계정을 만들어 연결하고, 실패해도 다음 회원을 계속한다", async () => {
    vi.stubEnv("ENABLE_DEV_MOCK_DATA", "true");
    const fixture = setupAuthFixture();
    fixture.addPlayer("Palice01", "dev_alice");
    const linkedUser = fixture.addAuthUser("bob", toInternalEmail("dev_bob"));
    fixture.addPlayer("Pbob0001", "dev_bob", linkedUser.id);
    fixture.addPlayer("Pcara001", "dev_cara");
    fixture.createAuthUser.mockImplementation(async ({ email, password }) => {
      if (email === toInternalEmail("dev_cara")) throw new Error("auth down");
      const id = `auth-${email}`;
      fixture.authAccounts.set(id, { email, password });
      return id;
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await new AuthService().seedDevAuthAccounts();

    expect(fixture.createAuthUser).toHaveBeenCalledWith({
      email: toInternalEmail("dev_alice"),
      password: "devpass1234",
    });
    expect(fixture.players.get("Palice01")).toMatchObject({
      authUserId: `auth-${toInternalEmail("dev_alice")}`,
      isFirstLogin: false,
    });
    expect(fixture.createAuthUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: toInternalEmail("dev_bob") }),
    );
    expect(fixture.players.get("Pcara001")?.authUserId).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("dev mock이 꺼져 있으면 아무것도 하지 않는다", async () => {
    vi.stubEnv("ENABLE_DEV_MOCK_DATA", "false");
    const fixture = setupAuthFixture();

    await new AuthService().seedDevAuthAccounts();

    expect(fixture.createAuthUser).not.toHaveBeenCalled();
  });
});
