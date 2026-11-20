import request from "supertest";
import express from "express";
import { DATA_KINDS } from "@pkpkdupr/shared/dataSync";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDataChangeSignalMiddleware,
  resolveDataChangeKinds,
} from "../middleware/dataChangeSignal";
import {
  createDataChangeSignal,
  readDataChangeSignalConfig,
} from "../services/DataChangeSignal";

const MATCH_KINDS = ["sessions", "matches", "ratings", "achievements"];

describe("resolveDataChangeKinds", () => {
  it.each([
    ["GET", "/api/matches"],
    ["HEAD", "/api/matches"],
    ["OPTIONS", "/api/matches"],
    ["POST", "/api/me/achievements/seen"],
    ["POST", "/api/me/password-changed/"],
    ["POST", "/api/admin/players/P1/official-dupr/preview"],
    ["POST", "/health"],
  ])("%s %s는 신호를 보내지 않는다", (method, path) => {
    expect(resolveDataChangeKinds(method, path)).toEqual([]);
  });

  it.each([
    ["POST", "/api/matches", MATCH_KINDS],
    ["PUT", "/api/matches/M1", MATCH_KINDS],
    ["DELETE", "/api/matches/M1", MATCH_KINDS],
    ["POST", "/api/matches/start", ["sessions", "matches"]],
    ["POST", "/api/matches/M1/start", ["sessions", "matches"]],
    ["POST", "/api/match-sessions/S1/matches", ["sessions", "matches"]],
    ["POST", "/api/match-sessions", ["sessions"]],
    ["POST", "/api/match-sessions/regular/today", ["sessions"]],
    ["POST", "/api/match-sessions/S1/participants", ["sessions"]],
    ["DELETE", "/api/match-sessions/S1/participants/P1", ["sessions"]],
    ["POST", "/api/match-sessions/S1/guests", ["sessions", "players"]],
    ["POST", "/api/match-sessions/S1/complete", ["sessions", "achievements"]],
    ["POST", "/api/cron/regular-sessions", ["sessions"]],
    ["POST", "/api/admin/matches/batch", MATCH_KINDS],
    ["PATCH", "/api/admin/matches/bulk-metadata", MATCH_KINDS],
    ["DELETE", "/api/admin/matches/M1", MATCH_KINDS],
    ["POST", "/api/admin/match-sessions", MATCH_KINDS],
    ["PATCH", "/api/admin/match-sessions/S1", MATCH_KINDS],
    ["POST", "/api/admin/match-sessions/S1/bracket-matches", ["sessions", "matches"]],
    ["PUT", "/api/admin/match-sessions/S1/placements", ["sessions"]],
    ["DELETE", "/api/admin/regular-session-skips/2026-11-23", ["sessions"]],
    ["PATCH", "/api/me/profile", ["players"]],
    ["POST", "/api/me/avatar", ["players"]],
    ["DELETE", "/API/ME/AVATAR/", ["players"]],
    ["POST", "/api/admin/register", ["players"]],
    ["PATCH", "/api/admin/players/P1/gender", ["players"]],
    ["PATCH", "/api/admin/players/P1/status", ["players", "ratings", "achievements"]],
    ["POST", "/api/admin/players/P1/promote", ["players", "ratings", "achievements"]],
    ["POST", "/api/admin/players/P1/official-dupr", ["matches", "ratings", "achievements"]],
    ["POST", "/api/admin/ratings/recalculate", ["matches", "ratings", "achievements"]],
  ])("%s %s는 정한 종류를 보낸다", (method, path, kinds) => {
    expect(resolveDataChangeKinds(method, path)).toEqual(kinds);
  });

  it("표에 없는 쓰기 경로는 모든 종류를 보낸다", () => {
    expect(resolveDataChangeKinds("POST", "/api/unknown-write")).toEqual(
      DATA_KINDS,
    );
  });
});

describe("createDataChangeSignalMiddleware", () => {
  const createApp = (status: number) => {
    const send = vi.fn();
    const app = express();
    app.use(createDataChangeSignalMiddleware({ send }));
    app.all(/.*/, (_req, res) => {
      res.status(status).json({});
    });
    return { app, send };
  };

  it("쓰기 요청이 2xx로 끝나면 응답 뒤 신호를 보낸다", async () => {
    const { app, send } = createApp(201);
    await request(app).post("/api/matches").send({});
    expect(send).toHaveBeenCalledWith(MATCH_KINDS);
  });

  it.each([400, 404, 409, 500])("%s 응답이면 보내지 않는다", async (status) => {
    const { app, send } = createApp(status);
    await request(app).post("/api/matches").send({});
    expect(send).not.toHaveBeenCalled();
  });

  it("읽기 요청과 본인 전용 쓰기는 보내지 않는다", async () => {
    const { app, send } = createApp(200);
    await request(app).get("/api/matches");
    await request(app).post("/api/me/achievements/seen").send({});
    expect(send).not.toHaveBeenCalled();
  });
});

describe("createDataChangeSignal", () => {
  const config = { supabaseUrl: "http://realtime.test", serviceRoleKey: "service-key" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("서비스 키로 private 채널 data-sync에 changed 이벤트를 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    const waitUntil = vi.fn();
    const signal = createDataChangeSignal({
      getConfig: () => config,
      fetch: fetchMock,
      waitUntil,
    });

    signal.send(["matches", "matches", "ratings"]);
    await signal.whenIdle();

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://realtime.test/realtime/v1/api/broadcast");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "service-key",
      Authorization: "Bearer service-key",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [
        {
          topic: "data-sync",
          event: "changed",
          payload: { kinds: ["matches", "ratings"] },
          private: true,
        },
      ],
    });
  });

  it("실패하면 한 번 다시 보내고, 또 실패하면 로그만 남긴다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const signal = createDataChangeSignal({ getConfig: () => config, fetch: fetchMock });

    signal.send(["sessions"]);
    await signal.whenIdle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it("다시 보내기에 성공하면 로그를 남기지 않는다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const signal = createDataChangeSignal({ getConfig: () => config, fetch: fetchMock });

    signal.send(["sessions"]);
    await signal.whenIdle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("설정이 없거나 종류가 비면 보내지 않는다", async () => {
    const fetchMock = vi.fn();
    createDataChangeSignal({ getConfig: () => null, fetch: fetchMock }).send([
      "sessions",
    ]);
    createDataChangeSignal({ getConfig: () => config, fetch: fetchMock }).send([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 모두 있어야 설정이 생긴다", () => {
    expect(readDataChangeSignalConfig({ SUPABASE_URL: "http://a.test/" })).toBeNull();
    expect(
      readDataChangeSignalConfig({ SUPABASE_SERVICE_ROLE_KEY: "key" }),
    ).toBeNull();
    expect(
      readDataChangeSignalConfig({
        SUPABASE_URL: "http://a.test/",
        SUPABASE_SERVICE_ROLE_KEY: "key",
      }),
    ).toEqual({ supabaseUrl: "http://a.test", serviceRoleKey: "key" });
  });
});
