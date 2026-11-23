import {
  type AchievementShareTarget,
  createAchievementShareImage,
} from "@/components/profile/achievementShareImage";
import { getAchievementShareText } from "@/lib/achievementShare";
import {
  type PreparedShareImageState,
  type ShareImageSource,
  usePreparedShareImage,
} from "@/hooks/usePreparedShareImage";

const ACHIEVEMENT_SHARE_SOURCE: ShareImageSource<AchievementShareTarget> = {
  getKey: (target) => `${target.definition.id}|${target.username}|${target.earnedAt ?? ""}`,
  create: createAchievementShareImage,
  getText: (target) => getAchievementShareText(target.username, target.definition.name),
};

/** 업적 공유 이미지를 미리 만들어 두고 누르면 공유한다. target이 null이면 만들지 않는다 */
export function useAchievementShare(target: AchievementShareTarget | null): PreparedShareImageState {
  return usePreparedShareImage(target, ACHIEVEMENT_SHARE_SOURCE);
}
