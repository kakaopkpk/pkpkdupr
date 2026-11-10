import { createClient } from "@supabase/supabase-js";

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

export const ALLOWED_EMAIL_DOMAIN =
  import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN?.trim() || "kakaocorp.com";

/** 하위 경로 배포에서도 앱 루트로 돌아오도록 BASE_URL을 붙인다. */
export const getAuthRedirectUrl = () =>
  `${window.location.origin}${import.meta.env.BASE_URL}`;

export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl(),
      queryParams: { hd: ALLOWED_EMAIL_DOMAIN },
    },
  });
  if (error) {
    throw new Error(error.message || "Google 로그인을 시작하지 못했습니다.");
  }
};

/** 로컬 개발 전용: 로컬 Supabase Mailpit으로 매직링크를 보낸다. */
export const signInWithMagicLink = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: getAuthRedirectUrl() },
  });
  if (error) {
    throw new Error(error.message || "로그인 링크를 보내지 못했습니다.");
  }
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
