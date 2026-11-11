import type { Player } from "@pkpkdupr/shared/player";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import {
  AuthService,
  type AuthenticatedSession,
} from "../services/AuthService";
import { getOwnedAvatarObjectPath } from "../services/AvatarStorage";

const SUPABASE_URL = "http://storage.test";
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
const now = new Date("2026-11-10T10:00:00.000Z");
const player: Player = {
  id: "Pavatar",
  username: "avatar-player",
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: now,
  updatedAt: now,
};
const session: AuthenticatedSession = {
  payload: { playerId: player.id, isAdmin: false },
  player,
  isFirstLogin: false,
};
const previousAvatarUrl = `${PUBLIC_PREFIX}${player.id}/old-uuid.jpg`;
const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from("jpeg-bytes").toString("base64")}`;

const okResponse = () => new Response("{}", { status: 200 });
type FetchCall = [
  string,
  { method?: string; headers?: Record<string, string>; body?: Uint8Array },
];
const createFetchMock = () => vi.fn(async (..._args: FetchCall) => okResponse());

describe("/api/me/avatar (Supabase Storage)", () => {
  let fetchMock: ReturnType<typeof createFetchMock>;

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("STORAGE_PUBLIC_URL", "");
    fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(AuthService.prototype, "authenticateAccessToken").mockResolvedValue(
      session,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("업로드 후 공개 URL을 저장하고 이전 파일을 삭제한다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...player,
      avatarUrl: previousAvatarUrl,
    });
    const updateProfile = vi
      .spyOn(AuthService.prototype, "updatePlayerProfile")
      .mockImplementation(async (_id, input) => ({
        ...player,
        avatarUrl: input.avatarUrl ?? undefined,
      }));

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: jpegDataUrl });

    expect(response.status).toBe(200);
    const savedUrl = updateProfile.mock.calls[0][1].avatarUrl as string;
    expect(savedUrl).toMatch(
      new RegExp(`^${PUBLIC_PREFIX}${player.id}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(response.body.avatarUrl).toBe(savedUrl);

    const objectPath = savedUrl.slice(PUBLIC_PREFIX.length);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe(
      `${SUPABASE_URL}/storage/v1/object/avatars/${objectPath}`,
    );
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.headers).toMatchObject({
      apikey: "service-role-key",
      Authorization: "Bearer service-role-key",
      "Content-Type": "image/jpeg",
      "x-upsert": "false",
    });
    expect(Buffer.from(uploadInit.body ?? []).toString()).toBe("jpeg-bytes");

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toBe(
      `${SUPABASE_URL}/storage/v1/object/avatars/${player.id}/old-uuid.jpg`,
    );
    expect(deleteInit.method).toBe("DELETE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("STORAGE_PUBLIC_URL이 있으면 공개 URL의 base로 쓴다", async () => {
    vi.stubEnv("STORAGE_PUBLIC_URL", "http://127.0.0.1:54321/");
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(player);
    const updateProfile = vi
      .spyOn(AuthService.prototype, "updatePlayerProfile")
      .mockResolvedValue(player);

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: jpegDataUrl });

    expect(response.status).toBe(200);
    expect(updateProfile.mock.calls[0][1].avatarUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/public\/avatars\/Pavatar\//,
    );
    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/storage\.test\//);
  });

  it("지원하지 않는 형식은 Storage 호출 없이 400을 돌려준다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(player);
    const updateProfile = vi.spyOn(AuthService.prototype, "updatePlayerProfile");

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: "data:image/gif;base64,R0lGOD==" });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("1MB를 넘는 이미지는 400을 돌려준다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(player);
    const tooLarge = Buffer.alloc(1024 * 1024 + 1).toString("base64");

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: `data:image/png;base64,${tooLarge}` });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "프로필 이미지는 1MB 이하만 업로드할 수 있습니다.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("업로드가 실패하면 avatar_url을 바꾸지 않는다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(player);
    const updateProfile = vi.spyOn(AuthService.prototype, "updatePlayerProfile");
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: jpegDataUrl });

    expect(response.status).toBe(500);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("DB 저장이 실패하면 올린 파일을 지운다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue(player);
    vi.spyOn(AuthService.prototype, "updatePlayerProfile").mockRejectedValue(
      new Error("db down"),
    );

    const response = await request(app)
      .post("/api/me/avatar")
      .set("Authorization", "Bearer test-token")
      .send({ imageDataUrl: jpegDataUrl });

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("DELETE는 파일과 avatar_url을 모두 지운다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...player,
      avatarUrl: previousAvatarUrl,
    });
    const updateProfile = vi
      .spyOn(AuthService.prototype, "updatePlayerProfile")
      .mockResolvedValue(player);

    const response = await request(app)
      .delete("/api/me/avatar")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith(player.id, { avatarUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${SUPABASE_URL}/storage/v1/object/avatars/${player.id}/old-uuid.jpg`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("DELETE에서 파일 삭제가 실패하면 avatar_url을 남긴다", async () => {
    vi.spyOn(AuthService.prototype, "getPlayerById").mockResolvedValue({
      ...player,
      avatarUrl: previousAvatarUrl,
    });
    const updateProfile = vi.spyOn(AuthService.prototype, "updatePlayerProfile");
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const response = await request(app)
      .delete("/api/me/avatar")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(500);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe("getOwnedAvatarObjectPath", () => {
  it("본인 소유의 Storage 공개 URL에서만 객체 경로를 꺼낸다", () => {
    expect(getOwnedAvatarObjectPath("P1", `${PUBLIC_PREFIX}P1/a.webp`)).toBe(
      "P1/a.webp",
    );
    expect(getOwnedAvatarObjectPath("P1", `${PUBLIC_PREFIX}P2/a.webp`)).toBeNull();
    expect(
      getOwnedAvatarObjectPath("P1", `${PUBLIC_PREFIX}P1/../P2/a.webp`),
    ).toBeNull();
    expect(getOwnedAvatarObjectPath("P1", "/uploads/avatars/P1-1.jpg")).toBeNull();
    expect(getOwnedAvatarObjectPath("P1", null)).toBeNull();
  });
});
