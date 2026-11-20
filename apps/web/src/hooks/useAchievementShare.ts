import { useCallback, useEffect, useState } from "react";
import {
  type AchievementShareTarget,
  createAchievementShareImage,
} from "@/components/profile/achievementShareImage";
import { getAchievementShareText, shareAchievementImage } from "@/lib/achievementShare";

type PreparedState =
  | { status: "preparing"; key: string }
  | { status: "ready"; key: string; file: File }
  | { status: "failed"; key: string };

interface AchievementShareState {
  /** 이미지를 만들지 못했으면 false. 공유 버튼을 숨긴다 */
  isAvailable: boolean;
  /** 이미지가 준비됐고 공유 중이 아닐 때만 true */
  canShare: boolean;
  share: () => void;
}

/**
 * 업적 공유 이미지를 미리 만들어 두고, 누르면 바로 공유 시트를 연다.
 * 사용자 동작 직후에만 공유 시트가 열리는 브라우저(iOS Safari)가 있어 누른 뒤에 만들지 않는다.
 * target이 null이면 만들지 않는다
 */
export function useAchievementShare(target: AchievementShareTarget | null): AchievementShareState {
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const key = target
    ? `${target.definition.id}|${target.username}|${target.earnedAt ?? ""}`
    : null;

  useEffect(() => {
    // 대상이 없어지면 만든 이미지를 놓아 준다
    if (!target || !key) {
      setPrepared(null);
      return undefined;
    }
    let isCancelled = false;
    setPrepared({ status: "preparing", key });
    createAchievementShareImage(target).then(
      (file) => {
        if (!isCancelled) setPrepared({ status: "ready", key, file });
      },
      () => {
        if (!isCancelled) setPrepared({ status: "failed", key });
      },
    );
    return () => {
      isCancelled = true;
    };
    // target 객체는 렌더마다 새로 만들어지므로 내용이 같은지는 key로 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = prepared && prepared.key === key ? prepared : null;
  const file = current?.status === "ready" ? current.file : null;
  const text = target ? getAchievementShareText(target.username, target.definition.name) : "";

  const share = useCallback(() => {
    if (!file || isSharing) return;
    setIsSharing(true);
    void shareAchievementImage(file, text).finally(() => setIsSharing(false));
  }, [file, isSharing, text]);

  return {
    isAvailable: current?.status !== "failed",
    canShare: !!file && !isSharing,
    share,
  };
}
