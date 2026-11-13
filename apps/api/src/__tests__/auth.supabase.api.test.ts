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
      isGuest: false,
      guestAddedByPlayerId: null,
      guestAddedSessionId: null,
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
  const findByAuthUserIdWithAdmin = vi
    .spyOn(db.players, "findByAuthUserIdWithAdmin")
    .mockImplementation(async (authUserId) => {
      const player = [...players.values()].find(
        (candidate) => candidate.authUserId === authUserId,
      );
      return player ? { player, isAdmin: admins.has(player.id) } : undefined;
    });
  // 인증 경로가 별도 회원·관리자 조회를 하지 않는지 확인하는 용도다.
  const findByAuthUserId = vi.spyOn(db.players, "findByAuthUserId");
  const isAdmin = vi.spyOn(db.playerAdmins, "isAdmin");
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
  return {
    findByAuthUserIdWithAdmin,
    findByAuthUserId,
    isAdmin,
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

const base64Url = (input: string | Uint8Array) =>
  Buffer.from(input).toString("base64url");

const encodeJwtParts = (
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
) => `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;

/** 현재 시각(가짜 타이머 포함) 기준 한 시간 뒤 만료. */
const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

/** 서명은 검증하지 않고 Auth 서버 사용자 조회로 확인하는 HS256 토큰. */
const hs256Token = (claims: Record<string, unknown> = { sub: "auth-hs" }) =>
  `${encodeJwtParts({ alg: "HS256", typ: "JWT" }, { exp: futureExp(), ...claims })}.${base64Url("signature")}`;

interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string; alg: string };
}

const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;

const createSigningKey = async (kid: string): Promise<SigningKey> => {
  const pair = await crypto.subtle.generateKey(ES256, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    publicJwk: { ...jwk, kid, alg: "ES256", key_ops: ["verify"] },
  };
};

/** WebCrypto ECDSA 서명은 JWS ES256과 같은 r||s 형식이다. */
const signEs256 = async (
  key: SigningKey,
  claims: Record<string, unknown>,
  kid = key.kid,
) => {
  const input = encodeJwtParts({ alg: "ES256", typ: "JWT", kid }, claims);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(new Uint8Array(signature))}`;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Supabase-Api-Version": "2024-01-01",
    },
  });

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

    /**
     * fixture의 getUser mock을 풀고, Auth 서버 HTTP 응답을 fetch stub으로 대신한다.
     * 요청 토큰은 Auth 서버 사용자 조회로 확인하는 HS256 토큰을 쓴다.
     */
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

    it("JWKS 엔드포인트를 조회하지 못하면 SESSION_UNAVAILABLE로 503을 준다", async () => {
      vi.mocked(SupabaseAuthUserVerifier.prototype.getUser).mockRestore();
      vi.stubEnv("SUPABASE_URL", "http://auth.test");
      vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const key = await createSigningKey("unreachable-kid");
      const token = await signEs256(key, { sub: "auth-es", exp: futureExp() });

      const response = await request(app).get("/api/me").set(bearer(token));

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("SESSION_UNAVAILABLE");
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

        const response = await request(app)
          .get("/api/me")
          .set(bearer(hs256Token()));

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

        const response = await request(app)
          .get("/api/me")
          .set(bearer(hs256Token()));

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

    it("회원과 관리자 여부를 DB 쿼리 1회로 가져온다", async () => {
      const authUser = fixture.addAuthUser("admin");
      fixture.addPlayer("Padmin01", "club_admin", authUser.id);
      fixture.admins.add("Padmin01");

      const response = await request(app).get("/api/me").set(bearer("admin"));

      expect(response.status).toBe(200);
      expect(response.body.isAdmin).toBe(true);
      expect(fixture.findByAuthUserIdWithAdmin).toHaveBeenCalledTimes(1);
      expect(fixture.findByAuthUserIdWithAdmin).toHaveBeenCalledWith(authUser.id);
      expect(fixture.findByAuthUserId).not.toHaveBeenCalled();
      expect(fixture.isAdmin).not.toHaveBeenCalled();
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

describe("SupabaseAuthUserVerifier 토큰 검증", () => {
  // auth-js는 엔드포인트에서 받은 JWKS를 Supabase URL(호스트)별 전역 캐시에 둔다. 테스트끼리 섞이지 않게 호스트를 바꾼다.
  let authHostNumber = 0;
  let AUTH_URL = "";
  let fetchMock: ReturnType<typeof vi.fn>;

  /** 요청 URL별 응답을 정한다. 정하지 않은 URL은 네트워크 오류로 실패한다. */
  const stubFetch = (routes: Record<string, () => Response>) => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const route = Object.entries(routes).find(([path]) =>
        url.startsWith(`${AUTH_URL}${path}`),
      );
      if (!route) throw new TypeError(`fetch failed: ${url}`);
      return route[1]();
    });
    vi.stubGlobal("fetch", fetchMock);
  };

  const requestedPaths = () =>
    fetchMock.mock.calls.map(([input]) =>
      new URL(String(input instanceof Request ? input.url : input)).pathname,
    );

  let key: SigningKey;

  beforeEach(async () => {
    AUTH_URL = `http://verifier${++authHostNumber}.test`;
    vi.stubEnv("SUPABASE_URL", AUTH_URL);
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_JWKS", "");
    key = await createSigningKey("project-key");
    stubFetch({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["{ keys: [...] }", (jwk: object) => ({ keys: [jwk] })],
    ["키 배열", (jwk: object) => [jwk]],
  ])(
    "SUPABASE_JWKS(%s)에 kid가 있으면 네트워크 요청 없이 sub를 돌려준다",
    async (_label, wrap) => {
      vi.stubEnv("SUPABASE_JWKS", JSON.stringify(wrap(key.publicJwk)));
      const token = await signEs256(key, { sub: "auth-es", exp: futureExp() });

      await expect(new SupabaseAuthUserVerifier().getUser(token)).resolves.toEqual({
        id: "auth-es",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("서명 불일치·만료·JWT 형식 아님·sub 없음은 null이다", async () => {
    vi.stubEnv("SUPABASE_JWKS", JSON.stringify({ keys: [key.publicJwk] }));
    const otherKey = await createSigningKey("other");
    const verifier = new SupabaseAuthUserVerifier();
    const tokens = [
      await signEs256(otherKey, { sub: "auth-es", exp: futureExp() }, key.kid),
      await signEs256(key, { sub: "auth-es", exp: Math.floor(Date.now() / 1000) - 1 }),
      "not-a-jwt",
      `${base64Url("not json")}.${base64Url("not json")}.${base64Url("sig")}`,
      await signEs256(key, { exp: futureExp() }),
    ];

    for (const token of tokens) {
      await expect(verifier.getUser(token)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SUPABASE_JWKS가 없으면 JWKS 엔드포인트에서 받은 키를 캐시해 쓴다", async () => {
    stubFetch({
      "/auth/v1/.well-known/jwks.json": () => jsonResponse({ keys: [key.publicJwk] }),
    });
    const verifier = new SupabaseAuthUserVerifier();

    for (const sub of ["auth-1", "auth-2"]) {
      const token = await signEs256(key, { sub, exp: futureExp() });
      await expect(verifier.getUser(token)).resolves.toEqual({ id: sub });
    }
    expect(requestedPaths()).toEqual(["/auth/v1/.well-known/jwks.json"]);
  });

  it("SUPABASE_JWKS를 읽지 못하면 경고하고 JWKS 엔드포인트를 조회한다", async () => {
    vi.stubEnv("SUPABASE_JWKS", "{not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubFetch({
      "/auth/v1/.well-known/jwks.json": () => jsonResponse({ keys: [key.publicJwk] }),
    });
    const token = await signEs256(key, { sub: "auth-es", exp: futureExp() });

    await expect(new SupabaseAuthUserVerifier().getUser(token)).resolves.toEqual({
      id: "auth-es",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(requestedPaths()).toEqual(["/auth/v1/.well-known/jwks.json"]);
  });

  it("JWKS 엔드포인트가 5xx·네트워크 오류면 일시 장애로 throw한다", async () => {
    const token = await signEs256(key, { sub: "auth-es", exp: futureExp() });

    await expect(new SupabaseAuthUserVerifier().getUser(token)).rejects.toThrow();

    stubFetch({
      "/auth/v1/.well-known/jwks.json": () => jsonResponse({ msg: "error" }, 500),
    });
    await expect(new SupabaseAuthUserVerifier().getUser(token)).rejects.toThrow();
  });

  it("HS256 토큰은 Auth 서버 사용자 조회로 확인한다", async () => {
    stubFetch({
      "/auth/v1/user": () => jsonResponse({ id: "auth-hs", aud: "authenticated" }),
    });

    await expect(
      new SupabaseAuthUserVerifier().getUser(hs256Token({ sub: "auth-hs" })),
    ).resolves.toEqual({ id: "auth-hs" });
    expect(requestedPaths()).toEqual(["/auth/v1/user"]);
  });

  it("어느 키 목록에도 없는 kid는 Auth 서버 사용자 조회로 확인한다", async () => {
    vi.stubEnv("SUPABASE_JWKS", JSON.stringify({ keys: [key.publicJwk] }));
    const rotatedKey = await createSigningKey("rotated");
    stubFetch({
      "/auth/v1/.well-known/jwks.json": () => jsonResponse({ keys: [key.publicJwk] }),
      "/auth/v1/user": () => jsonResponse({ id: "auth-es", aud: "authenticated" }),
    });
    const token = await signEs256(rotatedKey, { sub: "auth-es", exp: futureExp() });

    await expect(new SupabaseAuthUserVerifier().getUser(token)).resolves.toEqual({
      id: "auth-es",
    });
    expect(requestedPaths()).toEqual(["/auth/v1/.well-known/jwks.json", "/auth/v1/user"]);
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
