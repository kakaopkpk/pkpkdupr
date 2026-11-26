import type { Player } from "./player";

export type AuthErrorCode =
  | "SESSION_INVALID" // 401 토큰 없음·무효·만료
  | "SESSION_UNAVAILABLE" // 503 일시적으로 확인 실패
  | "ACCOUNT_NOT_LINKED" // 403 연결된 회원 없음, 관리자에게 문의
  | "FORBIDDEN"; // 403 관리자 아님

export interface AuthErrorResponse {
  error: string;
  code: AuthErrorCode;
}

/**
 * 로그인 아이디를 Supabase Auth 이메일로 바꿀 때 쓰는 내부 도메인. 이 주소로 메일을 보내지 않는다.
 * RFC 2606 예약 TLD `.invalid`라 실제로 배달될 수 없다. Auth는 admin 사용자 생성·비밀번호 로그인에서
 * 이메일 형식만 검사하므로 이 도메인으로 계정을 만들고 로그인할 수 있다.
 * 바꾸면 기존 Auth 사용자 이메일을 모두 옮겨야 한다.
 */
export const INTERNAL_EMAIL_DOMAIN = "pkpkdupr.invalid";

/** `.`은 맨 앞·맨 뒤에 오거나 연달아 올 수 없다. 이메일 앞부분 형식을 벗어나 Auth가 거부하기 때문이다. */
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const USERNAME_MAX_LENGTH = 64;

/** 아이디 형식: 영문·숫자·`.`·`_`·`-`만, 1~64자. 대소문자는 구분하지 않는다. 앞뒤 공백은 무시한다. */
export const isValidUsername = (username: string): boolean => {
  const trimmed = username.trim();
  return (
    trimmed.length >= 1 &&
    trimmed.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(trimmed)
  );
};

/** 아이디 비교 기준: 앞뒤 공백을 떼고 소문자로 바꾼다. 같으면 같은 아이디로 본다 */
export const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

/** 정규화한 아이디의 내부 이메일. 예: " Dev_Alice " → "dev_alice@<INTERNAL_EMAIL_DOMAIN>" */
export const toInternalEmail = (username: string): string =>
  `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;

/** GET /api/me, POST /api/me/password-changed 응답. isFirstLogin이 true면 web이 비밀번호 변경을 강제한다 */
export type MeResponse = Player & { isAdmin: boolean; isFirstLogin: boolean };

/** 관리자 회원 추가·비밀번호 초기화와 회원의 게스트 추가가 발급하는 임시 비밀번호. 첫 로그인에서 바꾸게 한다 */
export const ADMIN_ISSUED_PASSWORD = "123qwe";

/** 게스트가 경기 기록·시작·수정·삭제, 세션 만들기·완료, 게스트·다른 회원 참여자 변경을 요청했을 때의 403 메시지 */
export const GUEST_FORBIDDEN_MESSAGE =
  "게스트는 경기를 기록하거나 세션을 바꿀 수 없어요.";

/** POST /api/admin/register 요청 */
export interface AdminRegisterPlayerRequest {
  username: string;
  gender: "M" | "F";
}

/** POST /api/admin/register 응답. initialPassword는 이 응답에서만 보인다 */
export interface AdminRegisterPlayerResponse {
  player: Player;
  initialPassword: string;
}

/**
 * POST /api/admin/players/:playerId/promote 응답. 로그인 계정이 없던 게스트에게 새로 발급했을 때만 initialPassword가 있고,
 * 이미 게스트 계정이 있으면 그 아이디·비밀번호를 그대로 쓰므로 null이다.
 */
export interface AdminPromoteGuestResponse {
  player: Player;
  initialPassword: string | null;
}

/** POST /api/admin/players/:playerId/password-reset 응답. temporaryPassword는 이 응답에서만 보인다 */
export interface AdminPasswordResetResponse {
  temporaryPassword: string;
}

/** PATCH /api/admin/players/:playerId/username 요청 */
export interface AdminUpdateUsernameRequest {
  username: string;
}

/** PATCH /api/admin/players/:playerId/username 응답 */
export interface AdminUpdateUsernameResponse {
  player: Player;
}
