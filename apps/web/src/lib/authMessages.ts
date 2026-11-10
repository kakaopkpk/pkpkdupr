import { ALLOWED_EMAIL_DOMAIN } from "@/lib/supabase";

export const DOMAIN_NOT_ALLOWED_NOTICE = `회사 계정(@${ALLOWED_EMAIL_DOMAIN})으로 로그인해 주세요.`;

export const INVITE_INVALID_MESSAGE =
  "초대 코드가 올바르지 않거나 만료되었어요. 관리자에게 새 코드를 요청해 주세요.";
