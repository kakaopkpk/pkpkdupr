/** 서버가 뜨기 전에 확인하는 필수 환경변수. 하나라도 없으면 기동을 막는다. */
const REQUIRED_ENV_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export const assertRequiredEnv = () => {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `필수 환경변수가 없습니다: ${missing.join(", ")}. docs/deploy.md(운영)·docs/dev-environment.md(로컬)를 확인하세요.`,
    );
  }
};
