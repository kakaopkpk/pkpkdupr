import { createClient } from "@supabase/supabase-js";
import { toInternalEmail } from "@pkpkdupr/shared/auth";
import {
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_MIN_LENGTH,
} from "@/lib/authMessages";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수가 필요합니다.",
  );
}

// 브라우저에는 anon(publishable) key만 둔다. 세션 저장·토큰 갱신은 supabase-js가 맡는다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * 아이디·비밀번호로 로그인한다. 아이디는 내부 이메일로 바꿔 Supabase Auth에 넘긴다.
 * 아이디 형식은 따로 검사하지 않고, 형식이 틀린 아이디도 로그인 실패로 처리한다.
 */
export const signInWithUsername = async (username: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({
    email: toInternalEmail(username),
    password,
  });
  if (!error) {
    return;
  }
  // 없는 계정·틀린 비밀번호(invalid_credentials)와 형식 오류 등 400 응답은 같은 문구로 보여 준다.
  if (error.code === "invalid_credentials" || error.status === 400) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }
  throw new Error("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
};

/**
 * 로그인 세션만으로 비밀번호를 바꾼다(현재 비밀번호를 묻지 않는다).
 * 현재 비밀번호와 같으면(same_password) 바뀐 것이 없으므로 오류로 본다.
 * allowSamePassword는 이 세션에서 방금 같은 값으로 바꾼 뒤 다시 제출하는 경우에만 쓴다.
 */
export const updatePassword = async (
  password: string,
  { allowSamePassword = false }: { allowSamePassword?: boolean } = {},
) => {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) {
    return;
  }
  if (error.code === "same_password") {
    if (allowSamePassword) {
      return;
    }
    throw new Error("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
  }
  if (error.code === "weak_password") {
    throw new Error(
      `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`,
    );
  }
  throw new Error(error.message || "비밀번호를 변경하지 못했습니다.");
};

/**
 * 현재 기기 세션만 끝낸다. local scope는 저장된 세션을 먼저 지우므로
 * 서버 refresh token 폐기 요청이 실패(오프라인 등)해도 로그아웃된다.
 */
export const signOut = async () => {
  await supabase.auth.signOut({ scope: "local" });
};

export const getAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};
