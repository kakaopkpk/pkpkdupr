/** supabase/config.toml의 auth.minimum_password_length와 같다. */
export const PASSWORD_MIN_LENGTH = 6;

/** 로그인 화면이 이 문구로 "인증 실패"를 알아보고 비밀번호 칸을 빨갛게 표시한다. */
export const INVALID_CREDENTIALS_MESSAGE = "아이디나 비밀번호가 맞지 않아요";

export const ACCOUNT_NOT_LINKED_NOTICE =
  "연결된 회원이 없습니다. 관리자에게 문의해 주세요.";
