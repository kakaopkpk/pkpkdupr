import {
  type AchievementShareTarget,
  createAchievementShareImage,
} from "@/components/profile/achievementShareImage";
import { getAchievementShareText } from "@/lib/achievementShare";
import { type PreparedShareImageState, usePreparedShareImage } from "@/hooks/usePreparedShareImage";

/** 업적 공유 이미지를 미리 만들어 두고 누르면 공유한다. target이 null이면 만들지 않는다 */
export function useAchievementShare(target: AchievementShareTarget | null): PreparedShareImageState {
  const key = target
    ? `${target.definition.id}|${target.username}|${target.earnedAt ?? ""}`
    : null;
  const text = target ? getAchievementShareText(target.username, target.definition.name) : "";
  return usePreparedShareImage(
    key,
    () => (target ? createAchievementShareImage(target) : Promise.reject(new Error("공유할 업적이 없어요"))),
    text,
  );
}
