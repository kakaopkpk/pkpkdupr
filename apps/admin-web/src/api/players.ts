import type {
  AdminPasswordResetResponse,
  AdminPromoteGuestResponse,
  AdminRegisterPlayerRequest,
  AdminRegisterPlayerResponse,
  AdminUpdateUsernameRequest,
  AdminUpdateUsernameResponse,
} from "@pkpkdupr/shared/auth";
import type {
  AdminPlayer,
  AdminPromoteGuestRequest,
  Player,
  PlayerCreationLog,
  PlayerStatus,
  PlayerStatusChangeLog,
} from "@pkpkdupr/shared/player";
import { apiJson } from "./client";

const playerPath = (playerId: string) =>
  `/api/admin/players/${encodeURIComponent(playerId)}`;

export const fetchAdminPlayers = () =>
  apiJson<AdminPlayer[]>("/api/admin/players");

/** 회원 id → 계정 생성 기록 */
export const fetchPlayerCreationLogs = () =>
  apiJson<Record<string, PlayerCreationLog[]>>(
    "/api/admin/player-creation-logs",
  );

/** 회원 id → 상태 변경 기록 */
export const fetchPlayerStatusLogs = () =>
  apiJson<Record<string, PlayerStatusChangeLog[]>>(
    "/api/admin/player-status-logs",
  );

export const registerPlayer = (body: AdminRegisterPlayerRequest) =>
  apiJson<AdminRegisterPlayerResponse>("/api/admin/register", {
    method: "POST",
    body,
  });

export const resetPlayerPassword = (playerId: string) =>
  apiJson<AdminPasswordResetResponse>(`${playerPath(playerId)}/password-reset`, {
    method: "POST",
  });

export const promoteGuest = (
  playerId: string,
  body: AdminPromoteGuestRequest,
) =>
  apiJson<AdminPromoteGuestResponse>(`${playerPath(playerId)}/promote`, {
    method: "POST",
    body,
  });

export const updatePlayerUsername = (playerId: string, username: string) => {
  const body: AdminUpdateUsernameRequest = { username };
  return apiJson<AdminUpdateUsernameResponse>(
    `${playerPath(playerId)}/username`,
    { method: "PATCH", body },
  );
};

export const updatePlayerGender = (playerId: string, gender: "M" | "F") =>
  apiJson<{ player: Player; changed: boolean }>(
    `${playerPath(playerId)}/gender`,
    { method: "PATCH", body: { gender } },
  );

export const updatePlayerStatus = (playerId: string, status: PlayerStatus) =>
  apiJson<{ player: Player; log: PlayerStatusChangeLog | null }>(
    `${playerPath(playerId)}/status`,
    { method: "PATCH", body: { status } },
  );

export const deletePlayer = async (playerId: string): Promise<void> => {
  await apiJson<void>(playerPath(playerId), { method: "DELETE" });
};
