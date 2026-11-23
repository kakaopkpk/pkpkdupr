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
  /** 만들어 둔 이미지. 만드는 중이거나 실패했으면 null(미리보기에 쓴다) */
  file: File | null;
  share: () => void;
}

export interface ShareImageSource<T> {
  /** 같은 이미지인지 가르는 값. 이 값이 바뀔 때만 다시 만든다 */
  getKey: (target: T) => string;
  create: (target: T) => Promise<File>;
  /** 공유 시트에 함께 보내는 문구 */
  getText: (target: T) => string;
}

/**
 * 공유 이미지를 미리 만들어 두고, 누르면 바로 공유 시트를 연다.
 * 사용자 동작 직후에만 공유 시트가 열리는 브라우저(iOS Safari)가 있어 누른 뒤에 만들지 않는다.
 * target이 null이면 만들지 않는다. source는 모듈 수준 상수로 넘긴다
 */
export function usePreparedShareImage<T>(
  target: T | null,
  source: ShareImageSource<T>,
): PreparedShareImageState {
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const key = target === null ? null : source.getKey(target);
  // target 객체는 렌더마다 새로 만들어지므로 최신 것을 ref로 들고, 내용이 같은지는 key로 본다.
  // 아래 이미지 만들기 effect보다 먼저 선언해 같은 커밋에서 그 effect가 최신 target을 읽게 한다
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });

  useEffect(() => {
    const current = targetRef.current;
    // 대상이 없어지면 만든 이미지를 놓아 준다
    if (!key || current === null) {
      setPrepared(null);
      return undefined;
    }
    let isCancelled = false;
    setPrepared({ status: "preparing", key });
    // 이미지 만들기는 아이콘·배지를 flushSync로 SVG 문자열로 그린다. effect 안에서 바로 부르면 React가 아직
    // 커밋 중이라 flushSync가 그리지 못해 빈 SVG가 되므로, effect가 끝난 뒤(마이크로태스크)에 시작한다
    Promise.resolve().then(() => source.create(current)).then(
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
  }, [key, source]);

  const current = prepared && prepared.key === key ? prepared : null;
  const file = current?.status === "ready" ? current.file : null;
  const text = target === null ? "" : source.getText(target);

  const share = useCallback(() => {
    if (!file || isSharing) return;
    setIsSharing(true);
    void shareImageFile(file, text).finally(() => setIsSharing(false));
  }, [file, isSharing, text]);

  return {
    isAvailable: current?.status !== "failed",
    canShare: !!file && !isSharing,
    file,
    share,
  };
}
