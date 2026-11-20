import { getObjectParticle } from "@/lib/korean";

/** 공유 이미지와 함께 보내는 문구 */
export const getAchievementShareText = (username: string, achievementName: string) =>
  `${username}님이 업적 ${achievementName}${getObjectParticle(achievementName)} 달성했어요`;

/** 공유·내려받기 파일 이름. 업적 id에 파일 이름으로 못 쓰는 글자가 없어도 한 번 더 걸러 둔다 */
export const getAchievementShareFileName = (achievementId: string) =>
  `pkpkdupr-${achievementId.replace(/[^A-Za-z0-9.-]/g, "-")}.png`;

/**
 * 글자를 maxWidth 안에 들어가게 줄로 나눈다. 띄어쓰기 단위로 나누고,
 * 띄어쓰기 없이 한 줄을 넘는 낱말은 글자 단위로 자른다
 */
export const wrapText = (
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] => {
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = "";
    if (measure(word) <= maxWidth) {
      line = word;
      return;
    }
    for (const char of Array.from(word)) {
      if (line && measure(line + char) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  };
  text.split(/\s+/).filter(Boolean).forEach(pushWord);
  if (line) lines.push(line);
  return lines;
};

export type AchievementShareResult = "shared" | "downloaded" | "canceled";

/**
 * 기기 공유 시트로 이미지를 보낸다. 파일 공유를 못 하는 브라우저(PC 등)는 내려받는다.
 * 사용자가 공유 시트를 닫은 것은 "canceled"다.
 * 사용자 동작 직후에만 공유 시트가 열리는 브라우저(iOS Safari)가 있어, 파일은 미리 만들어 넘긴다
 */
export const shareAchievementImage = async (
  file: File,
  text: string,
): Promise<AchievementShareResult> => {
  const shareData: ShareData = { files: [file], text };
  if (typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "canceled";
      }
      // 공유가 거절되면(권한·사용자 동작 만료 등) 내려받기로 넘어간다
    }
  }
  downloadFile(file);
  return "downloaded";
};

const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 내려받기가 시작된 뒤에 푼다
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
