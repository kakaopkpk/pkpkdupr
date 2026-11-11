import { createClient } from "@supabase/supabase-js";
import { toInternalEmail } from "@pkpkdupr/shared/auth";

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
    persistSession: true,
    autoRefreshToken: true,
    // 리다이렉트 기반 로그인을 쓰지 않으므로 URL에서 세션을 읽지 않는다.
    detectSessionInUrl: false,
  },
});

const INVALID_CREDENTIALS_MESSAGE = "아이디 또는 비밀번호가 올바르지 않습니다.";

/** 관리자가 발급한 아이디·비밀번호로 로그인한다. 아이디는 내부 이메일로 바꿔 Supabase Auth에 넘긴다. */
export const signInWithUsername = async (username: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({
    email: toInternalEmail(username),
    password,
  });
  if (!error) {
    return;
  }
  // 400은 미확인 이메일·차단 등 다른 사유에도 오므로 코드로만 판별하고 나머지는 원문을 보여 준다.
  if (error.code === "invalid_credentials") {
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }
  throw new Error(error.message || "로그인하지 못했습니다.");
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
