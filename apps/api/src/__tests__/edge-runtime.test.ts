import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";
import { isEdgeRuntime, normalizeEdgeRequestUrl } from "../runtime";
import { AutoApprovalService } from "../services/AutoApprovalService";

const CRON_PATH = "/api/internal/cron/auto-approvals";

describe("auto-approval cron endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without the cron secret header", async () => {
    const processSpy = vi.spyOn(AutoApprovalService.prototype, "process");

    const response = await request(app).post(CRON_PATH);

    expect(response.status).toBe(401);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("rejects requests with a wrong cron secret", async () => {
    const processSpy = vi.spyOn(AutoApprovalService.prototype, "process");

    const response = await request(app)
      .post(CRON_PATH)
      .set("x-cron-secret", "wrong");

    expect(response.status).toBe(401);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const processSpy = vi.spyOn(AutoApprovalService.prototype, "process");

    const response = await request(app).post(CRON_PATH).set("x-cron-secret", "");

    expect(response.status).toBe(401);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("runs auto approvals with the matching cron secret", async () => {
    const processSpy = vi
      .spyOn(AutoApprovalService.prototype, "process")
      .mockResolvedValue({ completedMatches: [], appliedRatingCount: 2 });

    const response = await request(app)
      .post(CRON_PATH)
      .set("x-cron-secret", "cron-secret-value");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      completedMatchCount: 0,
      appliedRatingCount: 2,
    });
    expect(processSpy).toHaveBeenCalledTimes(1);
  });
});

describe("CORS preflight", () => {
  it("answers preflight from an allowed origin", async () => {
    const response = await request(app)
      .options("/api/players")
      .set("Origin", "http://localhost:8080")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8080",
    );
  });

  it("omits CORS headers for a disallowed origin instead of failing", async () => {
    const response = await request(app)
      .options("/api/players")
      .set("Origin", "https://not-allowed.example")
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBeLessThan(500);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("edge runtime helpers", () => {
  it("is not an edge runtime under Node", () => {
    expect(isEdgeRuntime()).toBe(false);
  });

  it.each([
    ["/api/health", "/api/health"],
    ["/functions/v1/api/health", "/api/health"],
    ["/functions/v1/api/players?status=active", "/api/players?status=active"],
    ["/functions/v1", "/"],
    ["/functions/v1?x=1", "/?x=1"],
    ["/functions/v10/api/health", "/functions/v10/api/health"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeEdgeRequestUrl(input)).toBe(expected);
  });
});
