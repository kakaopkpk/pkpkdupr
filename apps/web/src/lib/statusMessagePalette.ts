export type StatusMessageColorKey =
  | "blue"
  | "orange"
  | "slate"
  | "green"
  | "pink"
  | "purple"
  | "yellow"
  | "mint"
  | "red";

export interface StatusMessagePaletteEntry {
  key: StatusMessageColorKey;
  label: string;
  bg: string;
  fg: string;
}

/** 순서 고정, 첫 항목 blue가 기본. 저장값(statusMessageBackgroundColor)은 bg hex다 */
export const STATUS_MESSAGE_PALETTE: readonly StatusMessagePaletteEntry[] = [
  { key: "blue", label: "블루", bg: "#e6ebf8", fg: "#2346a8" },
  { key: "orange", label: "오렌지", bg: "#fdebd9", fg: "#9a4a07" },
  { key: "slate", label: "슬레이트", bg: "#e3e7f0", fg: "#4f5a70" },
  { key: "green", label: "그린", bg: "#dcf2e6", fg: "#0a6b47" },
  { key: "pink", label: "핑크", bg: "#fde2ec", fg: "#a3184f" },
  { key: "purple", label: "퍼플", bg: "#ece3fb", fg: "#5b2db0" },
  { key: "yellow", label: "옐로", bg: "#fbf3c8", fg: "#6b5000" },
  { key: "mint", label: "민트", bg: "#d8f3f1", fg: "#0f6b66" },
  { key: "red", label: "레드", bg: "#fde3e3", fg: "#a31d1d" },
];

/** 이전 8색 상태메시지 배경 저장값 → 같은 이름의 새 색 */
const LEGACY_STATUS_COLOR_KEYS: Record<string, StatusMessageColorKey> = {
  "#64748b": "slate",
  "#3b82f6": "blue",
  "#14b8a6": "mint",
  "#22c55e": "green",
  "#f59e0b": "yellow",
  "#f97316": "orange",
  "#ec4899": "pink",
  "#a855f7": "purple",
};

const DEFAULT_ENTRY = STATUS_MESSAGE_PALETTE[0];

/** 저장된 statusMessageBackgroundColor → 팔레트 항목. 모르는 값은 블루 */
export const resolveStatusMessageColor = (
  stored: string | null | undefined,
): StatusMessagePaletteEntry => {
  const normalized = stored?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_ENTRY;
  }

  const direct = STATUS_MESSAGE_PALETTE.find((entry) => entry.bg === normalized);
  if (direct) {
    return direct;
  }

  const legacyKey = LEGACY_STATUS_COLOR_KEYS[normalized];
  return (
    STATUS_MESSAGE_PALETTE.find((entry) => entry.key === legacyKey) ??
    DEFAULT_ENTRY
  );
};
