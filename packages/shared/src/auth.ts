import type { Player } from "./player";

export type AuthErrorCode =
  | "SESSION_INVALID" // 401 토큰 없음·무효·만료
  | "SESSION_UNAVAILABLE" // 503 일시적으로 확인 실패
  | "DOMAIN_NOT_ALLOWED" // 403 허용 도메인이 아니거나 이메일 미확인
  | "ACCOUNT_NOT_LINKED" // 403 연결된 회원 없음 → 초대 코드 필요
  | "INVITE_INVALID" // 400 없거나 만료되었거나 이미 사용된 코드
  | "ALREADY_LINKED" // 409
  | "FORBIDDEN"; // 403 관리자 아님

export interface AuthErrorResponse {
  error: string;
  code: AuthErrorCode;
}

/** GET /api/me, POST /api/auth/invite 응답 */
export type MeResponse = Player & { isAdmin: boolean };

/** POST /api/auth/invite 요청 */
export interface RedeemInviteRequest {
  code: string;
}

/** POST /api/admin/invite-codes 응답. 평문 코드는 이 응답에서만 보인다 */
export interface CreatedInviteCode {
  code: string;
  expiresAt: string;
}

/** GET /api/admin/invite-codes 응답 항목 */
export interface InviteCodeSummary {
  id: string;
  createdByUsername: string;
  createdAt: string;
  expiresAt: string;
  usedByUsername: string | null;
  usedAt: string | null;
}

/** POST /api/admin/register 요청 */
export interface AdminRegisterPlayerRequest {
  username: string;
  gender: Player["gender"];
}
