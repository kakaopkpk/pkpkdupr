export const RECENT_INPUT_HISTORY_STORAGE_KEY = "pkpkdupr:recent-inputs:v1";
export const RECENT_INPUT_HISTORY_LIMIT = 5;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type RecentInputHistory = Record<string, string[]>;

const getBrowserStorage = (): StorageLike | undefined => {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
};

const isRecentInputHistory = (value: unknown): value is RecentInputHistory =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeValues = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();

  return values.reduce<string[]>((result, value) => {
    if (typeof value !== "string") {
      return result;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue || seen.has(normalizedValue)) {
      return result;
    }

    seen.add(normalizedValue);
    result.push(normalizedValue);
    return result;
  }, []).slice(0, RECENT_INPUT_HISTORY_LIMIT);
};

const readHistory = (storage: StorageLike | undefined): RecentInputHistory => {
  if (!storage) {
    return {};
  }

  try {
    const serialized = storage.getItem(RECENT_INPUT_HISTORY_STORAGE_KEY);
    if (!serialized) {
      return {};
    }

    const parsed: unknown = JSON.parse(serialized);
    if (!isRecentInputHistory(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([fieldKey, values]) => [
        fieldKey,
        normalizeValues(values),
      ]),
    );
  } catch {
    return {};
  }
};

export const readRecentInputValues = (
  fieldKey: string,
  storage: StorageLike | undefined = getBrowserStorage(),
): string[] => readHistory(storage)[fieldKey] ?? [];

export const rememberRecentInputValue = (
  fieldKey: string,
  value: string,
  storage: StorageLike | undefined = getBrowserStorage(),
): string[] => {
  const normalizedValue = value.trim();
  if (!normalizedValue || !storage) {
    return readRecentInputValues(fieldKey, storage);
  }

  const history = readHistory(storage);
  const nextValues = normalizeValues([
    normalizedValue,
    ...(history[fieldKey] ?? []),
  ]);

  try {
    storage.setItem(
      RECENT_INPUT_HISTORY_STORAGE_KEY,
      JSON.stringify({
        ...history,
        [fieldKey]: nextValues,
      }),
    );
  } catch {
    // 최근 입력값 저장 실패는 폼 저장과 입력 경험을 막지 않는다.
  }

  return nextValues;
};
