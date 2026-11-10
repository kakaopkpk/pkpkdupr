import { createHash } from "crypto";
import type {
  CreateInviteCodeInput,
  CreatePlayerAuthLinkLogInput,
  RedeemInviteCodeInput,
  StoredPlayerRecord,
} from "@pkpkdupr/db";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db";
import { app } from "../index";
import {
  SupabaseAuthUserVerifier,
  type SupabaseAuthUser,
} from "../services/supabaseAuthUser";

const NOW = new Date("2026-11-10T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

type StoredInvite = CreateInviteCodeInput & {
  usedAt: Date | null;
  usedByPlayerId: string | null;
};

/**
 * Supabase Auth와 DB 저장소를 메모리로 대신한다.
 * 초대 코드 소비 조건(미사용·미만료)과 unique 제약은 InviteCodeRepository·마이그레이션과 같게 흉내 낸다.
 */
const setupAuthFixture = () => {
  const authUsers = new Map<string, SupabaseAuthUser>();
  const players = new Map<string, StoredPlayerRecord>();
  const admins = new Set<string>();
  const invites: StoredInvite[] = [];
  const authLinkLogs: CreatePlayerAuthLinkLogInput[] = [];

  const addAuthUser = (
    token: string,
    email: string | null,
    emailConfirmed = true,
    provider: string | null = "google",
  ): SupabaseAuthUser => {
    const user = { id: `auth-${token}`, email, emailConfirmed, provider };
    authUsers.set(token, user);
    return user;
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
      createdAt: NOW,
      updatedAt: NOW,
    };
    players.set(id, player);
    return player;
  };

  vi.spyOn(SupabaseAuthUserVerifier.prototype, "getUser").mockImplementation(
    async (token) => authUsers.get(token) ?? null,
  );
  vi.spyOn(db.players, "findById").mockImplementation(async (id) =>
    players.get(id),
  );
  vi.spyOn(db.players, "findByAuthUserId").mockImplementation(
    async (authUserId) =>
      [...players.values()].find((player) => player.authUserId === authUserId),
  );
  vi.spyOn(db.players, "findByUsernameIgnoringCase").mockImplementation(
    async (username) =>
      [...players.values()].find(
        (player) => player.username.toLowerCase() === username.toLowerCase(),
      ),
  );
  const linkAuthUser = vi
    .spyOn(db.players, "linkAuthUser")
    .mockImplementation(async (id, authUserId) => {
      const player = players.get(id);
      if (!player || player.authUserId || player.status !== "active") {
        return false;
      }
      player.authUserId = authUserId;
      return true;
    });
  vi.spyOn(db.playerAuthLinkLogs, "create").mockImplementation(
    async (input) => {
      authLinkLogs.push(input);
    },
  );
  vi.spyOn(db.playerAdmins, "isAdmin").mockImplementation(async (playerId) =>
    admins.has(playerId),
  );
  vi.spyOn(db.inviteCodes, "create").mockImplementation(async (input) => {
    invites.push({ ...input, usedAt: null, usedByPlayerId: null });
  });
  vi.spyOn(db.inviteCodes, "redeemForNewPlayer").mockImplementation(
    async ({ codeHash, usedAt, player }: RedeemInviteCodeInput) => {
      const invite = invites.find(
        (candidate) =>
          candidate.codeHash === codeHash &&
          candidate.usedAt === null &&
          candidate.expiresAt.getTime() > usedAt.getTime(),
      );
      if (!invite) return false;
      if (
        [...players.values()].some(
          (existing) =>
            existing.username.toLowerCase() === player.username.toLowerCase() ||
            existing.authUserId === player.authUserId,
        )
      ) {
        throw new Error("duplicate key value violates unique constraint");
      }
      invite.usedAt = usedAt;
      invite.usedByPlayerId = player.id;
      addPlayer(player.id, player.username, player.authUserId);
      return true;
    },
  );

  return {
    addAuthUser,
    addPlayer,
    admins,
    authLinkLogs,
    invites,
    players,
    linkAuthUser,
  };
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Supabase Auth 기반 인증", () => {
  let fixture: ReturnType<typeof setupAuthFixture>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "kakaocorp.com");
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
    /** fixture의 getUser mock을 풀고, Auth 서버 HTTP 응답을 fetch stub으로 대신한다. */
    const stubAuthServerError = (status: number, code?: string) => {
      vi.mocked(SupabaseAuthUserVerifier.prototype.getUser).mockRestore();
      vi.stubEnv("SUPABASE_URL", "http://auth.test");
      vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ...(code && { code }), msg: code ?? "error" }), {
              status,
              // SDK는 이 헤더가 있어야 응답 본문의 code를 에러 코드로 읽는다(실제 Auth 서버는 항상 보낸다).
              headers: {
                "Content-Type": "application/json",
                "X-Supabase-Api-Version": "2024-01-01",
              },
            }),
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
      [401, undefined],
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
      [503, undefined],
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

  describe("허용 도메인", () => {
    it.each([
      ["다른 도메인", "dev_alice@gmail.com", true],
      ["허용 도메인으로 끝나는 다른 도메인", "dev_alice@notkakaocorp.com", true],
      ["허용 도메인의 하위 도메인", "dev_alice@mail.kakaocorp.com", true],
      ["이메일 미확인", "dev_alice@kakaocorp.com", false],
    ])(
      "%s 계정은 DOMAIN_NOT_ALLOWED로 거부하고 같은 앞부분의 회원과 연결하지 않는다",
      async (_label, email, emailConfirmed) => {
        fixture.addPlayer("Palice01", "dev_alice");
        fixture.addAuthUser("outsider", email, emailConfirmed);

        const response = await request(app)
          .get("/api/me")
          .set(bearer("outsider"));

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
        expect(fixture.linkAuthUser).not.toHaveBeenCalled();
        expect(fixture.players.get("Palice01")?.authUserId).toBeNull();
      },
    );

    it("허용 도메인·확인된 이메일이어도 기본 설정에서는 Google 외 provider를 DOMAIN_NOT_ALLOWED로 거부한다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("magic", "dev_alice@kakaocorp.com", true, "email");

      const response = await request(app).get("/api/me").set(bearer("magic"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
      expect(fixture.linkAuthUser).not.toHaveBeenCalled();
      expect(fixture.players.get("Palice01")?.authUserId).toBeNull();
    });

    it("provider를 알 수 없는 토큰도 거부한다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("unknown", "dev_alice@kakaocorp.com", true, null);

      const response = await request(app).get("/api/me").set(bearer("unknown"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("허용되지 않은 provider는 초대 코드 가입 전에 거부한다", async () => {
      fixture.addAuthUser("magic", "newbie@kakaocorp.com", true, "email");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("magic"))
        .send({ code: "ABCD2345", username: "newbie" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
      expect(fixture.players.size).toBe(0);
    });

    it("ALLOWED_AUTH_PROVIDERS 목록에 있는 provider는 통과하고 목록에 없는 provider(google)는 거부한다", async () => {
      vi.stubEnv("ALLOWED_AUTH_PROVIDERS", " google , Email ");
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("magic", "dev_alice@kakaocorp.com", true, "email");

      const allowed = await request(app).get("/api/me").set(bearer("magic"));
      expect(allowed.status).toBe(200);

      vi.stubEnv("ALLOWED_AUTH_PROVIDERS", "email");
      fixture.addAuthUser("google", "dev_alice@kakaocorp.com", true, "google");
      const denied = await request(app).get("/api/me").set(bearer("google"));
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("허용 provider여도 도메인이 다르면 거부한다", async () => {
      vi.stubEnv("ALLOWED_AUTH_PROVIDERS", "google,email");
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("magic", "dev_alice@gmail.com", true, "email");

      const response = await request(app).get("/api/me").set(bearer("magic"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("ALLOWED_EMAIL_DOMAIN이 비어 있으면 모든 계정을 거부한다", async () => {
      vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "");
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
    });
  });

  describe("자동 연결", () => {
    it("이메일 앞부분과 대소문자 구분 없이 같은 username의 미연결 회원과 연결한다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      const authUser = fixture.addAuthUser("alice", "Dev_Alice@KakaoCorp.com");

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: "Palice01",
        username: "dev_alice",
        isAdmin: false,
      });
      expect(fixture.players.get("Palice01")?.authUserId).toBe(authUser.id);
      expect(fixture.authLinkLogs).toEqual([
        {
          id: expect.stringMatching(/^player-auth-link-log-/),
          playerId: "Palice01",
          authUserId: authUser.id,
          linkMethod: "email_local_part",
          createdAt: NOW,
        },
      ]);
      // 이메일·Auth 사용자 ID는 응답에 싣지 않는다.
      expect(JSON.stringify(response.body)).not.toContain("@");
      expect(response.body).not.toHaveProperty("authUserId");
    });

    it("같은 username의 회원이 inactive면 연결하지 않고 ACCOUNT_NOT_LINKED를 준다", async () => {
      fixture.addPlayer("Palice01", "dev_alice").status = "inactive";
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ACCOUNT_NOT_LINKED");
      expect(fixture.linkAuthUser).not.toHaveBeenCalled();
      expect(fixture.players.get("Palice01")?.authUserId).toBeNull();
      expect(fixture.authLinkLogs).toHaveLength(0);
    });

    it("조회 후 inactive로 바뀐 회원은 연결·감사 로그 없이 ACCOUNT_NOT_LINKED를 준다", async () => {
      const player = fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");
      const findByUsername = vi.mocked(db.players.findByUsernameIgnoringCase);
      const lookup = findByUsername.getMockImplementation()!;
      findByUsername.mockImplementationOnce(async (username) => {
        // 조회 시점에는 active였다가 연결 직전에 관리자가 inactive로 바꾼 상황.
        const found = await lookup(username);
        const snapshot = found && { ...found };
        player.status = "inactive";
        return snapshot;
      });

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ACCOUNT_NOT_LINKED");
      expect(fixture.linkAuthUser).toHaveBeenCalledTimes(1);
      expect(fixture.players.get("Palice01")?.authUserId).toBeNull();
      expect(fixture.authLinkLogs).toHaveLength(0);
    });

    it("다른 요청이 먼저 연결해 이 요청이 연결하지 못했으면 감사 로그를 남기지 않는다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      const authUser = fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");
      fixture.linkAuthUser.mockImplementationOnce(async (id, authUserId) => {
        // 같은 요청자의 동시 요청이 조회와 연결 사이에 먼저 연결한 상황.
        fixture.players.get(id)!.authUserId = authUserId;
        return false;
      });

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("Palice01");
      expect(fixture.players.get("Palice01")?.authUserId).toBe(authUser.id);
      expect(fixture.authLinkLogs).toHaveLength(0);
    });

    it("동시에 여러 번 요청해도 감사 로그는 한 번만 남긴다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");

      const responses = await Promise.all([
        request(app).get("/api/me").set(bearer("alice")),
        request(app).get("/api/me").set(bearer("alice")),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(fixture.authLinkLogs).toHaveLength(1);
    });

    it("이미 연결된 요청자는 같은 회원으로 계속 인증된다", async () => {
      const authUser = fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");
      fixture.addPlayer("Palice01", "dev_alice", authUser.id);

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe("Palice01");
      expect(fixture.linkAuthUser).not.toHaveBeenCalled();
      expect(fixture.authLinkLogs).toHaveLength(0);
    });

    it("같은 username이 다른 Auth 사용자와 연결돼 있으면 ACCOUNT_NOT_LINKED를 준다", async () => {
      fixture.addPlayer("Palice01", "dev_alice", "auth-someone-else");
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ACCOUNT_NOT_LINKED");
      expect(fixture.players.get("Palice01")?.authUserId).toBe(
        "auth-someone-else",
      );
    });

    it("같은 username의 회원이 없으면 ACCOUNT_NOT_LINKED를 준다", async () => {
      fixture.addAuthUser("newbie", "newbie@kakaocorp.com");

      const response = await request(app).get("/api/me").set(bearer("newbie"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ACCOUNT_NOT_LINKED");
    });

    it("GET /api/me 밖의 API는 자동 연결하지 않는다", async () => {
      fixture.addPlayer("Palice01", "dev_alice");
      fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");

      const response = await request(app)
        .get("/api/players")
        .set(bearer("alice"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("ACCOUNT_NOT_LINKED");
      expect(fixture.linkAuthUser).not.toHaveBeenCalled();
    });

    it("비활성 회원은 SESSION_INVALID로 거부한다", async () => {
      const authUser = fixture.addAuthUser("alice", "dev_alice@kakaocorp.com");
      fixture.addPlayer("Palice01", "dev_alice", authUser.id).status =
        "inactive";

      const response = await request(app).get("/api/me").set(bearer("alice"));

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
    });
  });

  describe("관리자 판정", () => {
    it("player_admins에 있는 회원만 관리자다", async () => {
      const adminUser = fixture.addAuthUser("admin", "club_admin@kakaocorp.com");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
      const memberUser = fixture.addAuthUser("member", "member@kakaocorp.com");
      fixture.addPlayer("Pmember1", "member", memberUser.id);

      const [adminMe, memberMe, memberAdminApi] = await Promise.all([
        request(app).get("/api/me").set(bearer("admin")),
        request(app).get("/api/me").set(bearer("member")),
        request(app).get("/api/admin/invite-codes").set(bearer("member")),
      ]);

      expect(adminMe.body.isAdmin).toBe(true);
      expect(memberMe.body.isAdmin).toBe(false);
      expect(memberAdminApi.status).toBe(403);
      expect(memberAdminApi.body).toEqual({
        error: "관리자 권한이 필요합니다.",
        code: "FORBIDDEN",
      });
    });

    it("username이 admin이어도 player_admins에 없으면 관리자가 아니다", async () => {
      const authUser = fixture.addAuthUser("admin", "admin@kakaocorp.com");
      fixture.addPlayer("Padmin02", "admin", authUser.id);

      const response = await request(app)
        .post("/api/admin/invite-codes")
        .set(bearer("admin"));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });
  });

  describe("초대 코드", () => {
    const issueInviteCode = async () => {
      const adminUser = fixture.addAuthUser("admin", "club_admin@kakaocorp.com");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
      const response = await request(app)
        .post("/api/admin/invite-codes")
        .set(bearer("admin"));
      expect(response.status).toBe(201);
      return response.body as { code: string; expiresAt: string };
    };

    it("관리자가 7일 뒤 만료되는 8자 코드를 발급하고 DB에는 해시만 저장한다", async () => {
      const created = await issueInviteCode();

      expect(created.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
      expect(created.expiresAt).toBe(
        new Date(NOW.getTime() + 7 * DAY_MS).toISOString(),
      );
      expect(fixture.invites).toHaveLength(1);
      expect(fixture.invites[0].codeHash).toBe(
        createHash("sha256").update(created.code).digest("hex"),
      );
      expect(JSON.stringify(fixture.invites[0])).not.toContain(created.code);
    });

    it("유효한 코드면 이메일 앞부분(소문자)으로 회원을 만들어 연결하고 201을 준다", async () => {
      const { code } = await issueInviteCode();
      const authUser = fixture.addAuthUser("newbie", "NewBie@kakaocorp.com");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("newbie"))
        .send({ code: ` ${code.toLowerCase()} ` });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        username: "newbie",
        status: "active",
        isAdmin: false,
      });
      expect(response.body).not.toHaveProperty("authUserId");
      const created = fixture.players.get(response.body.id);
      expect(created?.authUserId).toBe(authUser.id);
      expect(fixture.invites[0]).toMatchObject({
        usedByPlayerId: response.body.id,
        usedAt: NOW,
      });

      const me = await request(app).get("/api/me").set(bearer("newbie"));
      expect(me.status).toBe(200);
      expect(me.body.id).toBe(response.body.id);
    });

    it("이미 사용한 코드는 INVITE_INVALID로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addAuthUser("first", "first@kakaocorp.com");
      fixture.addAuthUser("second", "second@kakaocorp.com");

      const first = await request(app)
        .post("/api/auth/invite")
        .set(bearer("first"))
        .send({ code });
      const second = await request(app)
        .post("/api/auth/invite")
        .set(bearer("second"))
        .send({ code });

      expect(first.status).toBe(201);
      expect(second.status).toBe(400);
      expect(second.body.code).toBe("INVITE_INVALID");
      expect(
        [...fixture.players.values()].some(
          (player) => player.username === "second",
        ),
      ).toBe(false);
    });

    it("만료된 코드는 INVITE_INVALID로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addAuthUser("late", "late@kakaocorp.com");
      vi.setSystemTime(new Date(NOW.getTime() + 7 * DAY_MS));

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("late"))
        .send({ code });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVITE_INVALID");
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("없는 코드는 INVITE_INVALID로 거부한다", async () => {
      await issueInviteCode();
      fixture.addAuthUser("newbie", "newbie@kakaocorp.com");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("newbie"))
        .send({ code: "ZZZZ9999" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVITE_INVALID");
    });

    it("이미 연결된 요청자는 ALREADY_LINKED로 거부하고 코드를 쓰지 않는다", async () => {
      const { code } = await issueInviteCode();

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("admin"))
        .send({ code });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_LINKED");
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("같은 username이 다른 Auth 사용자에게 연결돼 있으면 ALREADY_LINKED로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addPlayer("Ptaken01", "taken", "auth-someone-else");
      fixture.addAuthUser("taken", "Taken@kakaocorp.com");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("taken"))
        .send({ code });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_LINKED");
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("대소문자만 다른 username이 다른 Auth 사용자에게 연결돼 있으면 ALREADY_LINKED로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addPlayer("Ptaken01", "Taken", "auth-someone-else");
      fixture.addAuthUser("taken", "taken@kakaocorp.com");
      const playerCount = fixture.players.size;

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("taken"))
        .send({ code });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_LINKED");
      expect(fixture.players.size).toBe(playerCount);
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("사전 검사 뒤 대소문자만 다른 username이 먼저 생기면 lower(username) 유니크 위반을 ALREADY_LINKED로 바꾸고 코드를 쓰지 않는다", async () => {
      const { code } = await issueInviteCode();
      fixture.addAuthUser("racer", "racer@kakaocorp.com");
      vi.spyOn(db.inviteCodes, "redeemForNewPlayer").mockRejectedValue(
        Object.assign(
          new Error(
            'duplicate key value violates unique constraint "players_username_lower_unique"',
          ),
          { code: "23505" },
        ),
      );

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("racer"))
        .send({ code });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_LINKED");
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("같은 username의 active 미연결 회원이 있으면 코드를 쓰지 않고 그 회원과 연결하며 감사 로그를 남긴다", async () => {
      const { code } = await issueInviteCode();
      fixture.addPlayer("Pmember1", "member");
      const authUser = fixture.addAuthUser("member", "Member@kakaocorp.com");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("member"))
        .send({ code });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe("Pmember1");
      expect(fixture.players.get("Pmember1")?.authUserId).toBe(authUser.id);
      expect(fixture.invites[0].usedAt).toBeNull();
      expect(fixture.authLinkLogs).toEqual([
        expect.objectContaining({
          playerId: "Pmember1",
          authUserId: authUser.id,
          linkMethod: "email_local_part",
        }),
      ]);
    });

    it("같은 username의 회원이 inactive면 연결·생성하지 않고 ALREADY_LINKED로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addPlayer("Pleft001", "left_member").status = "inactive";
      fixture.addAuthUser("left", "left_member@kakaocorp.com");
      const playerCount = fixture.players.size;

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("left"))
        .send({ code });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ALREADY_LINKED");
      expect(fixture.players.get("Pleft001")?.authUserId).toBeNull();
      expect(fixture.players.size).toBe(playerCount);
      expect(fixture.invites[0].usedAt).toBeNull();
      expect(fixture.authLinkLogs).toHaveLength(0);
    });

    it("다른 도메인 계정은 코드가 유효해도 DOMAIN_NOT_ALLOWED로 거부한다", async () => {
      const { code } = await issueInviteCode();
      fixture.addAuthUser("outsider", "newbie@gmail.com");

      const response = await request(app)
        .post("/api/auth/invite")
        .set(bearer("outsider"))
        .send({ code });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DOMAIN_NOT_ALLOWED");
      expect(fixture.invites[0].usedAt).toBeNull();
    });

    it("발급 목록은 평문 코드 없이 발급자·사용자 username만 준다", async () => {
      const adminUser = fixture.addAuthUser("admin", "club_admin@kakaocorp.com");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
      vi.spyOn(db.inviteCodes, "findAllSummaries").mockResolvedValue([
        {
          id: "invite-code-1",
          createdByUsername: "club_admin",
          createdAt: NOW,
          expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
          usedByUsername: "newbie",
          usedAt: NOW,
        },
      ]);

      const response = await request(app)
        .get("/api/admin/invite-codes")
        .set(bearer("admin"));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          id: "invite-code-1",
          createdByUsername: "club_admin",
          createdAt: NOW.toISOString(),
          expiresAt: new Date(NOW.getTime() + 7 * DAY_MS).toISOString(),
          usedByUsername: "newbie",
          usedAt: NOW.toISOString(),
        },
      ]);
    });
  });

  describe("관리자 회원 추가", () => {
    beforeEach(() => {
      const adminUser = fixture.addAuthUser("admin", "club_admin@kakaocorp.com");
      fixture.addPlayer("Padmin01", "club_admin", adminUser.id);
      fixture.admins.add("Padmin01");
    });

    it("username·gender로 미연결 회원을 만든다", async () => {
      const create = vi
        .spyOn(db.players, "create")
        .mockImplementation(async (input) => ({
          ...fixture.addPlayer(input.id, input.username, null),
          gender: input.gender,
        }));
      vi.spyOn(db.playerCreationLogs, "create").mockImplementation(
        async (input) => input,
      );

      const response = await request(app)
        .post("/api/admin/register")
        .set(bearer("admin"))
        .send({ username: " pre_member ", gender: "M", password: "ignored" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ username: "pre_member", gender: "M" });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ username: "pre_member", authUserId: null }),
      );
      expect(create.mock.calls[0][0]).not.toHaveProperty("password");
    });

    it("대소문자만 다른 username도 중복으로 거부한다", async () => {
      fixture.addPlayer("Pmember1", "member");

      const response = await request(app)
        .post("/api/admin/register")
        .set(bearer("admin"))
        .send({ username: "Member", gender: "F" });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("중복된 사용자명입니다.");
    });

    it("사전 검사 뒤 lower(username) 유니크 인덱스 위반이 나도 중복 메시지를 준다", async () => {
      // 동시 요청이 먼저 대소문자만 다른 username을 만든 경우를 흉내 낸다.
      vi.spyOn(db.players, "create").mockRejectedValue(
        Object.assign(
          new Error(
            'duplicate key value violates unique constraint "players_username_lower_unique"',
          ),
          { code: "23505" },
        ),
      );

      const response = await request(app)
        .post("/api/admin/register")
        .set(bearer("admin"))
        .send({ username: "Member", gender: "F" });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("중복된 사용자명입니다.");
    });

    it("gender가 M·F가 아니면 400을 준다", async () => {
      const response = await request(app)
        .post("/api/admin/register")
        .set(bearer("admin"))
        .send({ username: "pre_member", gender: "X" });

      expect(response.status).toBe(400);
    });
  });
});
