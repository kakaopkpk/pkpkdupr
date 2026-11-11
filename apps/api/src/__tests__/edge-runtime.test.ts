import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../index";
import { isEdgeRuntime, normalizeEdgeRequestUrl } from "../runtime";

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
