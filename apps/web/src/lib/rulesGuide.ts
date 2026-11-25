import { useSyncExternalStore } from "react";

/** 이 기기에서 본 안내 카드 번호(0부터) 배열(JSON) */
export const RULES_GUIDE_SEEN_STORAGE_KEY = "pkpkdupr:rules-guide-seen";
/** 홈 규칙 안내 카드를 X로 닫은 기기면 "1" */
export const RULES_GUIDE_CLOSED_STORAGE_KEY = "pkpkdupr:rules-guide-closed";

/** 안내 카드 장 수. 안내 화면 모듈(RULES_GUIDE_CARDS)을 홈에 끌어오지 않으려고 따로 둔다 */
export const RULES_GUIDE_CARD_COUNT = 12;

interface RulesGuideProgress {
  closed: boolean;
  seen: ReadonlySet<number>;
}

const listeners = new Set<() => void>();
// 저장소에 쓰지 못하는 환경(사생활 보호 모드 등)에서도 이 실행 동안은 본 장·닫음을 기억한다
let progress: RulesGuideProgress | null = null;

const isCardIndex = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < RULES_GUIDE_CARD_COUNT;

const readSeen = (): Set<number> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RULES_GUIDE_SEEN_STORAGE_KEY) ?? "[]",
    );
    return new Set(Array.isArray(parsed) ? parsed.filter(isCardIndex) : []);
  } catch {
    return new Set();
  }
};

const readClosed = (): boolean => {
  try {
    return localStorage.getItem(RULES_GUIDE_CLOSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const getProgress = (): RulesGuideProgress => {
  progress ??= { closed: readClosed(), seen: readSeen() };
  return progress;
};

const update = (next: RulesGuideProgress, key: string, value: string) => {
  progress = next;
  try {
    localStorage.setItem(key, value);
  } catch {
    // 메모리 값으로 이 실행 동안만 기억한다
  }
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 이 기기에서 본 안내 카드 장 수 */
export const getRulesGuideSeenCount = (): number => getProgress().seen.size;

/** 홈 규칙 안내 카드를 숨길지. X로 닫았거나 12장을 모두 본 기기다 */
export const isRulesGuideCardHidden = (): boolean => {
  const { closed, seen } = getProgress();
  return closed || seen.size >= RULES_GUIDE_CARD_COUNT;
};

/** 안내 화면에서 index(0부터)번째 카드가 지금 카드가 되면 부른다 */
export const markRulesGuideCardSeen = (index: number): void => {
  const current = getProgress();
  if (!isCardIndex(index) || current.seen.has(index)) return;
  const seen = new Set(current.seen).add(index);
  update(
    { ...current, seen },
    RULES_GUIDE_SEEN_STORAGE_KEY,
    JSON.stringify([...seen].sort((a, b) => a - b)),
  );
};

/** 홈 카드의 X. 그 기기에서는 홈 카드가 다시 나오지 않는다 */
export const closeRulesGuideCard = (): void => {
  const current = getProgress();
  if (current.closed) return;
  update({ ...current, closed: true }, RULES_GUIDE_CLOSED_STORAGE_KEY, "1");
};

/** 홈 규칙 안내 카드를 숨길지. 안내 화면에서 카드를 넘기거나 X를 누르면 바로 바뀐다 */
export const useIsRulesGuideCardHidden = (): boolean =>
  useSyncExternalStore(subscribe, isRulesGuideCardHidden, () => true);

/** 이 기기에서 본 안내 카드 장 수(홈 카드의 "12장 중 n장 읽음") */
export const useRulesGuideSeenCount = (): number =>
  useSyncExternalStore(subscribe, getRulesGuideSeenCount, () => 0);
