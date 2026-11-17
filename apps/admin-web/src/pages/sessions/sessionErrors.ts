import { ApiError, isClientError } from "../../api/client";

const FALLBACK_MESSAGE = "처리하지 못했어요. 다시 시도해 주세요.";

/** 서버의 같은 날 같은 이름 409는 화면 문구로 바꾸고, 나머지 4xx는 서버 문구를 쓴다 */
const toClientMessage = (error: ApiError): string =>
  error.status === 409 && error.message.includes("같은 이름")
    ? "이미 같은 이름의 세션이 있어요"
    : error.message;

/**
 * 바꾸는 작업의 실패를 나눠 알린다. 4xx는 화면 안 문구(showInline),
 * 네트워크·5xx는 토스트(showToast)다.
 */
export const reportMutationError = (
  error: unknown,
  showInline: (message: string) => void,
  showToast: (message: string) => void,
): void => {
  if (isClientError(error)) {
    showInline(toClientMessage(error));
    return;
  }
  showToast(error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE);
};

/** 조회 실패 문구 */
export const getLoadErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;
