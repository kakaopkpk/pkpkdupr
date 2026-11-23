import { useCallback, useEffect, useRef, useState } from "react";
import { shareImageFile } from "@/lib/shareImage";

type PreparedState =
  | { status: "preparing"; key: string }
  | { status: "ready"; key: string; file: File }
  | { status: "failed"; key: string };

export interface PreparedShareImageState {
  /** 이미지를 만들지 못했으면 false. 공유 버튼을 숨긴다 */
  isAvailable: boolean;
  /** 이미지가 준비됐고 공유 중이 아닐 때만 true */
  canShare: boolean;
  share: () => void;
}

/**
 * 공유 이미지를 미리 만들어 두고, 누르면 바로 공유 시트를 연다.
 * 사용자 동작 직후에만 공유 시트가 열리는 브라우저(iOS Safari)가 있어 누른 뒤에 만들지 않는다.
 * key가 null이면 만들지 않고, key가 바뀔 때만 다시 만든다
 */
export function usePreparedShareImage(
  key: string | null,
  create: () => Promise<File>,
  text: string,
): PreparedShareImageState {
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  // create는 렌더마다 새로 만들어지므로 최신 것을 ref로 들고 key로만 다시 만든다
  const createRef = useRef(create);
  createRef.current = create;

  useEffect(() => {
    // 대상이 없어지면 만든 이미지를 놓아 준다
    if (!key) {
      setPrepared(null);
      return undefined;
    }
    let isCancelled = false;
    setPrepared({ status: "preparing", key });
    createRef.current().then(
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
  }, [key]);

  const current = prepared && prepared.key === key ? prepared : null;
  const file = current?.status === "ready" ? current.file : null;

  const share = useCallback(() => {
    if (!file || isSharing) return;
    setIsSharing(true);
    void shareImageFile(file, text).finally(() => setIsSharing(false));
  }, [file, isSharing, text]);

  return {
    isAvailable: current?.status !== "failed",
    canShare: !!file && !isSharing,
    share,
  };
}
