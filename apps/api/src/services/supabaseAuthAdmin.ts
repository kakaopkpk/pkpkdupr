import {
  createClient,
  isAuthApiError,
  type SupabaseClient,
} from "@supabase/supabase-js";

/** 같은 이메일의 Auth 사용자가 이미 있다. */
export class AuthEmailExistsError extends Error {
  constructor(email: string) {
    super(`이미 같은 이메일의 Auth 사용자가 있습니다: ${email}`);
    this.name = "AuthEmailExistsError";
  }
}

const throwAuthAdminError = (error: unknown, email?: string): never => {
  if (email && isAuthApiError(error) && error.code === "email_exists") {
    throw new AuthEmailExistsError(email);
  }
  throw error;
};

const LIST_USERS_PAGE_SIZE = 1000;

export interface AuthUserSummary {
  id: string;
  email: string | null;
  /** 마지막 아이디·비밀번호 로그인 시각. 로그인한 적이 없으면 null */
  lastSignInAt: Date | null;
}

/**
 * service role 키로 Supabase Auth 사용자를 만들고 바꾸는 관리자 클라이언트.
 * Edge Function에는 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 자동 주입되고, 로컬 Node api는 `pnpm dev`가 넣는다.
 * 공개 가입(signUp)을 막아도 admin API로 만드는 사용자는 영향을 받지 않는다.
 */
export class SupabaseAuthAdmin {
  private client?: SupabaseClient;

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = process.env.SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!url || !key) {
        throw new Error(
          "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
        );
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

  /** 이메일을 확인된 상태로 만든다. 같은 이메일이 있으면 AuthEmailExistsError를 던진다. 새 사용자 id를 돌려준다. */
  async createUser(input: { email: string; password: string }): Promise<string> {
    const { data, error } = await this.getClient().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error) {
      throwAuthAdminError(error, input.email);
    }
    return data.user!.id;
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.getClient().auth.admin.getUserById(userId);
    if (error) {
      throw error;
    }
    return data.user?.email ?? null;
  }

  /** 이메일을 바꾸면 확인 메일 없이 바로 확인된 상태가 된다. 같은 이메일이 있으면 AuthEmailExistsError를 던진다. */
  async updateUser(
    userId: string,
    input: { email?: string; password?: string },
  ): Promise<void> {
    const { error } = await this.getClient().auth.admin.updateUserById(userId, {
      ...input,
      ...(input.email ? { email_confirm: true } : {}),
    });
    if (error) {
      throwAuthAdminError(error, input.email);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.getClient().auth.admin.deleteUser(userId);
    if (error) {
      throw error;
    }
  }

  /** 모든 Auth 사용자. 전체 목록을 훑으므로 dev 시딩·데이터 이관·관리자 회원 목록처럼 드문 경로에서만 쓴다. */
  async listUsers(): Promise<AuthUserSummary[]> {
    const users: AuthUserSummary[] = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.getClient().auth.admin.listUsers({
        page,
        perPage: LIST_USERS_PAGE_SIZE,
      });
      if (error) {
        throw error;
      }
      users.push(
        ...data.users.map((user) => ({
          id: user.id,
          email: user.email ?? null,
          lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at) : null,
        })),
      );
      if (data.users.length < LIST_USERS_PAGE_SIZE) {
        return users;
      }
    }
  }

  /** 이메일(소문자 비교)로 사용자 id를 찾는다. */
  async findUserIdByEmail(email: string): Promise<string | null> {
    const target = email.toLowerCase();
    const found = (await this.listUsers()).find(
      (user) => user.email?.toLowerCase() === target,
    );
    return found?.id ?? null;
  }
}

/** Auth 비밀번호 요구(최소 6자, `letters_digits`)를 통과하는지. 초기 비밀번호를 사람이 정할 때 확인한다 */
export const isValidInitialPassword = (password: string): boolean =>
  password.length >= 6 && /[A-Za-z]/.test(password) && /\d/.test(password);
