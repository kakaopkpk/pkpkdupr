import { createHmac, timingSafeEqual } from "crypto";
import type { PlayerQrTokenResponse } from "@pkpkdupr/shared/qr";

const QR_TOKEN_VERSION = "1";
const QR_TOKEN_SCHEME = "pkpkdupr:";
const QR_TOKEN_HOST = "player-qr";
const DEV_QR_TOKEN_HOST = "player-qr-dev";
const QR_TOKEN_STEP_MS = 15 * 60 * 1000;

/** 기동 시 assertRequiredEnv()가 확인하지만, 다른 경로로 불려도 빈 키로 서명하지 않도록 사용할 때 다시 확인한다. */
const getQrTotpSecret = (): string => {
  const secret = process.env.QR_TOTP_SECRET?.trim();
  if (!secret) {
    throw new Error("QR_TOTP_SECRET 환경변수가 필요합니다.");
  }
  return secret;
};

export const getPlayerQrStep = (nowMs = Date.now()): number =>
  Math.floor(nowMs / QR_TOKEN_STEP_MS);

const getStepExpiresAtMs = (step: number): number =>
  (step + 1) * QR_TOKEN_STEP_MS;

const createPlayerQrMessage = (playerId: string, step: number): string =>
  `player-qr:v${QR_TOKEN_VERSION}:${playerId}:${step}`;

const createDevPlayerQrMessage = (playerId: string): string =>
  `player-qr-dev:v${QR_TOKEN_VERSION}:${playerId}`;

export const createPlayerQrCode = (
  playerId: string,
  step: number,
): string => {
  const digest = createHmac("sha256", getQrTotpSecret())
    .update(createPlayerQrMessage(playerId, step))
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 100_000_000).padStart(8, "0");
};

const createDevPlayerQrCode = (playerId: string): string => {
  const digest = createHmac("sha256", getQrTotpSecret())
    .update(createDevPlayerQrMessage(playerId))
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 100_000_000).padStart(8, "0");
};

const isSafeCodeEqual = (received: string, expected: string): boolean => {
  const encoder = new TextEncoder();
  const receivedBuffer = encoder.encode(received);
  const expectedBuffer = encoder.encode(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
};

export const createPlayerQrToken = (
  playerId: string,
  nowMs = Date.now(),
): PlayerQrTokenResponse => {
  const step = getPlayerQrStep(nowMs);
  const code = createPlayerQrCode(playerId, step);
  const payloadParams = new URLSearchParams();
  payloadParams.set("v", QR_TOKEN_VERSION);
  payloadParams.set("playerId", playerId);
  payloadParams.set("step", String(step));
  payloadParams.set("code", code);

  const expiresAtMs = getStepExpiresAtMs(step);

  return {
    payload: `${QR_TOKEN_SCHEME}//${QR_TOKEN_HOST}?${payloadParams.toString()}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlSeconds: Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000)),
  };
};

export const createDevPlayerQrPayload = (playerId: string): string => {
  const payloadParams = new URLSearchParams();
  payloadParams.set("v", QR_TOKEN_VERSION);
  payloadParams.set("playerId", playerId);
  payloadParams.set("code", createDevPlayerQrCode(playerId));

  return `${QR_TOKEN_SCHEME}//${DEV_QR_TOKEN_HOST}?${payloadParams.toString()}`;
};

export const isDevPlayerQrPayload = (payload: string): boolean => {
  try {
    const url = new URL(payload);
    return url.protocol === QR_TOKEN_SCHEME && url.hostname === DEV_QR_TOKEN_HOST;
  } catch {
    return false;
  }
};

export const verifyPlayerQrPayload = (
  payload: string,
  nowMs = Date.now(),
): string => {
  let url: URL;

  try {
    url = new URL(payload);
  } catch {
    throw new Error("QR 코드 형식이 올바르지 않습니다.");
  }

  const version = url.searchParams.get("v");
  const playerId = url.searchParams.get("playerId");
  const step = Number(url.searchParams.get("step"));
  const code = url.searchParams.get("code");

  if (
    url.protocol !== QR_TOKEN_SCHEME ||
    url.hostname !== QR_TOKEN_HOST ||
    version !== QR_TOKEN_VERSION ||
    !playerId ||
    !Number.isInteger(step) ||
    step < 0 ||
    !code?.match(/^\d{8}$/)
  ) {
    throw new Error("QR 코드 형식이 올바르지 않습니다.");
  }

  if (step !== getPlayerQrStep(nowMs)) {
    throw new Error("QR 코드가 만료되었습니다. 새 QR 코드를 요청해주세요.");
  }

  const expectedCode = createPlayerQrCode(playerId, step);
  if (!isSafeCodeEqual(code, expectedCode)) {
    throw new Error("QR 코드가 유효하지 않습니다.");
  }

  return playerId;
};

export const verifyDevPlayerQrPayload = (payload: string): string => {
  let url: URL;

  try {
    url = new URL(payload);
  } catch {
    throw new Error("QR 코드 형식이 올바르지 않습니다.");
  }

  const version = url.searchParams.get("v");
  const playerId = url.searchParams.get("playerId");
  const code = url.searchParams.get("code");

  if (
    url.protocol !== QR_TOKEN_SCHEME ||
    url.hostname !== DEV_QR_TOKEN_HOST ||
    version !== QR_TOKEN_VERSION ||
    !playerId ||
    !code?.match(/^\d{8}$/)
  ) {
    throw new Error("QR 코드 형식이 올바르지 않습니다.");
  }

  const expectedCode = createDevPlayerQrCode(playerId);
  if (!isSafeCodeEqual(code, expectedCode)) {
    throw new Error("QR 코드가 유효하지 않습니다.");
  }

  return playerId;
};
