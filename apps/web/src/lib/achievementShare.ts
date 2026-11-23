import { getObjectParticle } from "@/lib/korean";
import { toShareFileName } from "@/lib/shareImage";

/** 공유 이미지와 함께 보내는 문구 */
export const getAchievementShareText = (username: string, achievementName: string) =>
  `${username}님이 업적 ${achievementName}${getObjectParticle(achievementName)} 달성했어요`;

/** 공유·내려받기 파일 이름. 업적 id에 파일 이름으로 못 쓰는 글자가 없어도 한 번 더 걸러 둔다 */
export const getAchievementShareFileName = (achievementId: string) => toShareFileName(achievementId);
