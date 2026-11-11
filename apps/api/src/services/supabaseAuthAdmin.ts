import { randomInt } from "crypto";
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

  /** 이메일(소문자 비교)로 사용자 id를 찾는다. 전체 목록을 훑으므로 dev 시딩처럼 드문 경로에서만 쓴다. */
  async findUserIdByEmail(email: string): Promise<string | null> {
    const target = email.toLowerCase();
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.getClient().auth.admin.listUsers({
        page,
        perPage: LIST_USERS_PAGE_SIZE,
      });
      if (error) {
        throw error;
      }
      const found = data.users.find(
        (user) => user.email?.toLowerCase() === target,
      );
      if (found) {
        return found.id;
      }
      if (data.users.length < LIST_USERS_PAGE_SIZE) {
        return null;
      }
    }
  }
}

const INITIAL_PASSWORD_LENGTH = 10;
/** 0/O/o, 1/I/l처럼 옮겨 적을 때 헷갈리는 문자를 뺀 영문 대소문자. */
const PASSWORD_LETTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_ALPHABET = PASSWORD_LETTERS + PASSWORD_DIGITS;

/**
 * 관리자가 회원에게 전달할 초기·임시 비밀번호. 영문과 숫자를 각각 1자 이상 넣어
 * Auth 최소 길이(6)와 `letters_digits` 요구를 모두 통과한다.
 */
export const generateInitialPassword = (): string => {
  for (;;) {
    const password = Array.from(
      { length: INITIAL_PASSWORD_LENGTH },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
    ).join("");
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) {
      return password;
    }
  }
};
