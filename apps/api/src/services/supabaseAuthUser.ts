import { createClient, isAuthApiError, type SupabaseClient } from "@supabase/supabase-js";

/** Supabase Auth가 확인해 준 요청자 정보. 브라우저가 보낸 값이 아니라 Auth 서버 응답이다. */
export interface SupabaseAuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

/**
 * Supabase Auth access token을 Auth 서버(`GET /auth/v1/user`)로 확인한다.
 * Edge Function에는 SUPABASE_URL·SUPABASE_ANON_KEY가 자동 주입되고, 로컬 Node api는 `pnpm dev`가 넣는다.
 */
export class SupabaseAuthUserVerifier {
  private client?: SupabaseClient;

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = process.env.SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_ANON_KEY?.trim();
      if (!url || !key) {
        throw new Error("SUPABASE_URL과 SUPABASE_ANON_KEY 환경변수가 필요합니다.");
      }
      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    }
    return this.client;
  }

  /**
   * 토큰이 무효·만료됐거나 사용자가 없으면 null을 돌려준다.
   * 네트워크·Auth 서버 장애처럼 토큰 유효성을 판단하지 못한 경우는 throw한다.
   */
  async getUser(accessToken: string): Promise<SupabaseAuthUser | null> {
    const { data, error } = await this.getClient().auth.getUser(accessToken);
    if (error) {
      if (isAuthApiError(error) && error.status >= 400 && error.status < 500) {
        return null;
      }
      throw error;
    }

    const user = data.user;
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email ?? null,
      emailConfirmed: !!user.email_confirmed_at,
    };
  }
}
