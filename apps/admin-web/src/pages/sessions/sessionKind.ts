import type { MatchSessionKind } from "@pkpkdupr/shared/session";

export const SESSION_KIND_LABELS: Record<MatchSessionKind, string> = {
  regular: "정기",
  custom: "회원 세션",
  tournament: "대회",
};

/** 세션 종류 고르기 순서 */
export const SESSION_KIND_OPTIONS: { value: MatchSessionKind; label: string }[] = [
  { value: "custom", label: "회원 세션" },
  { value: "tournament", label: "대회" },
  { value: "regular", label: "정기" },
];

/** 패널 제목 옆 종류 칩 색 */
export const SESSION_KIND_CHIP_CLASS: Record<MatchSessionKind, string> = {
  regular: "bg-pk-primary text-white",
  custom: "border border-pk-primary-line bg-white text-pk-primary",
  tournament: "bg-pk-ink text-white",
};

/** 달력의 오늘·미래 세션 알약 색 */
export const SESSION_KIND_PILL_CLASS: Record<MatchSessionKind, string> = {
  regular: "bg-pk-primary text-white hover:bg-pk-deep",
  custom:
    "border border-pk-primary-line bg-white text-pk-primary hover:bg-pk-primary-soft",
  tournament: "bg-pk-ink text-white hover:bg-pk-deep",
};
