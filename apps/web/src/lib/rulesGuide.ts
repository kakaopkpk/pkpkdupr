import { useSyncExternalStore } from "react";

/** 홈 소식 맨 위 규칙 안내 카드를 다시 보이지 않을 기기인지(안내 화면을 열었거나 X로 닫음) */
export const RULES_GUIDE_DISMISSED_STORAGE_KEY = "pkpkdupr:rules-guide-dismissed";

const listeners = new Set<() => void>();
// 저장소에 쓰지 못하는 환경(사생활 보호 모드 등)에서도 이 실행 동안은 다시 보이지 않게 한다
let dismissedInMemory = false;

/** 홈 규칙 안내 카드를 숨길지(이 기기에서 안내 화면을 열었거나 카드를 닫았는지) */
export const isRulesGuideCardDismissed = (): boolean => {
  if (dismissedInMemory) return true;
  try {
    return localStorage.getItem(RULES_GUIDE_DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 안내 화면을 열거나 홈 카드를 닫으면 부른다. 그 기기에서는 홈 카드가 다시 나오지 않는다 */
export const dismissRulesGuideCard = (): void => {
  if (isRulesGuideCardDismissed()) return;
  dismissedInMemory = true;
  try {
    localStorage.setItem(RULES_GUIDE_DISMISSED_STORAGE_KEY, "1");
  } catch {
    // 메모리 값으로 이 실행 동안만 숨긴다
  }
  for (const listener of listeners) listener();
};

/** 홈 규칙 안내 카드를 숨길지. 설정에서 안내 화면을 열어도 바로 바뀐다 */
export const useIsRulesGuideCardDismissed = (): boolean =>
  useSyncExternalStore(subscribe, isRulesGuideCardDismissed, () => true);
