import { apiFetch } from "@/lib/api";
import { trackAchievementWrite } from "@/lib/achievements";
import { isRulesGuideRead } from "@/lib/rulesGuide";

/** 이 실행에서 지금 회원(syncedPlayerId)의 완독이 서버에 있는지. 있으면 다시 보내지 않는다 */
let isSubmitted = false;
let syncedPlayerId: string | null = null;
let pending: Promise<boolean> | null = null;

const postRulesGuideComplete = async (): Promise<boolean> => {
  const res = await apiFetch("/api/me/rules-guide/complete", { method: "POST" });
  return res.ok;
};

/**
 * 이 기기에서 모든 장을 봤으면 서버에 완독(업적 모범생)을 남긴다. 처음 남겼으면 true다.
 * 실패는 알리지 않고 다음 앱 진입(syncRulesGuideCompletion) 때 다시 보낸다.
 * 미확인 업적 조회가 이 요청을 기다리므로, 안내 화면을 닫자마자 축하가 뜬다
 */
export const submitRulesGuideCompletion = (): Promise<boolean> => {
  if (isSubmitted || !isRulesGuideRead()) return Promise.resolve(false);
  pending ??= trackAchievementWrite(
    postRulesGuideComplete()
      .catch(() => false)
      .then((ok) => {
        isSubmitted = ok;
        pending = null;
        return ok;
      }),
  );
  return pending;
};

/**
 * 앱 진입 때 부른다. 이 기기는 다 읽었는데 서버에 완독이 없으면(전에 보내다 실패) 다시 보낸다.
 * serverCompletedAt은 /api/me 회원의 rulesGuideCompletedAt이다
 */
export const syncRulesGuideCompletion = (
  playerId: string,
  serverCompletedAt: unknown,
): Promise<boolean> => {
  // 다른 회원으로 바뀌면 그 회원의 서버 값부터 다시 따른다. 같은 회원이면 이 실행에서 보낸 기록을 지키되 서버 값으로 채운다
  if (playerId !== syncedPlayerId) {
    syncedPlayerId = playerId;
    isSubmitted = false;
  }
  if (serverCompletedAt) isSubmitted = true;
  return submitRulesGuideCompletion();
};
