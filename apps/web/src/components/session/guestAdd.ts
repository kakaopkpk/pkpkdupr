import { isValidUsername, normalizeUsername } from "@pkpkdupr/shared/auth";

export const GUEST_USERNAME_FORMAT_HINT =
  "아이디는 영문·숫자·.·_·-로 64자까지 쓸 수 있어요. .은 맨 앞·맨 뒤나 연달아 쓸 수 없어요.";

/** 참여자 편집의 "게스트로 추가" 줄. isValid가 false면 줄은 눌리지 않고 형식 안내를 보인다 */
export interface GuestAddOption {
  username: string;
  isValid: boolean;
}

/**
 * 회원 목록을 다 받았고 검색어가 있으면 검색 결과와 상관없이 게스트 추가 줄을 보인다.
 * 아이디는 앞뒤 공백을 뗀 검색어다. 대소문자만 다른 같은 아이디가 이미 있으면(비활성 회원 포함)
 * 서버가 중복으로 거절하므로 보이지 않는다.
 */
export const getGuestAddOption = ({
  query,
  playersStatus,
  existingUsernames,
}: {
  query: string;
  playersStatus: "loading" | "ready" | "error";
  /** 상태와 상관없는 모든 회원·게스트 아이디 */
  existingUsernames: readonly string[];
}): GuestAddOption | null => {
  const username = query.trim();
  if (playersStatus !== "ready" || !username) return null;
  const normalized = normalizeUsername(username);
  if (existingUsernames.some((name) => normalizeUsername(name) === normalized)) {
    return null;
  }
  return { username, isValid: isValidUsername(username) };
};
