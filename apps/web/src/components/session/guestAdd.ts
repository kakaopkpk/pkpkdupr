import { isValidUsername } from "@pkpkdupr/shared/auth";

export const GUEST_USERNAME_FORMAT_HINT =
  "아이디는 영문·숫자·.·_·-로 64자까지 쓸 수 있어요. .은 맨 앞·맨 뒤나 연달아 쓸 수 없어요.";

/** 참여자 편집의 "게스트로 추가" 줄. isValid가 false면 줄은 눌리지 않고 형식 안내를 보인다 */
export interface GuestAddOption {
  username: string;
  isValid: boolean;
}

/**
 * 회원 목록을 다 받았고 검색어가 있는데 결과가 없을 때만 게스트 추가 줄을 보인다.
 * 아이디는 앞뒤 공백을 뗀 검색어다.
 */
export const getGuestAddOption = ({
  query,
  playersStatus,
  resultCount,
}: {
  query: string;
  playersStatus: "loading" | "ready" | "error";
  resultCount: number;
}): GuestAddOption | null => {
  const username = query.trim();
  if (playersStatus !== "ready" || resultCount > 0 || !username) return null;
  return { username, isValid: isValidUsername(username) };
};
