import React, { useEffect, useRef, useState } from "react";
import type { SessionPraiseResponse } from "@pkpkdupr/shared/sessionPraise";
import { useDataVersion } from "@/context/DataSyncContext";
import type { TabKey } from "@/context/TabNavigationContext";
import {
  fetchPendingSessionPraises,
  pickPendingSessionPraise,
  readSkippedSessionPraises,
  rememberSkippedSessionPraise,
} from "@/lib/sessionPraise";
import SessionPraisePopup from "./SessionPraisePopup";

// 세션이 끝나거나 경기·참여가 바뀌면 띄울 세션이 달라진다. 칭찬하면 sessions가 무효화된다
const PRAISE_DATA_KINDS = ["sessions", "matches"] as const;

interface ShownPraise {
  praise: SessionPraiseResponse;
  tabKey: TabKey;
}

export interface PendingSessionPraisePopupProps {
  playerId: string | null;
  /** 전역 화면·바텀시트·메뉴가 하나도 열려 있지 않고 업적 축하도 없을 때만 true. 그동안만 조회하고 띄운다 */
  isActive: boolean;
  /** 지금 보는 탭. 팝업이 이 탭에 깊이를 쌓아 뒤로가기로 닫힌다 */
  tabKey: TabKey;
  /**
   * 조회 중이거나 팝업이 떠 있으면 true. 업적 축하가 이 동안 기다려 칭찬 팝업이 먼저 뜬다
   * (조회가 끝나 띄울 것이 없으면 false)
   */
  onBusyChange: (isBusy: boolean) => void;
}

/**
 * 끝난 세션의 칭찬 팝업을 띄운다. 앱을 열 때, 세션·경기 데이터 버전이 바뀔 때(무효화·앱 복귀 TTL),
 * 열린 화면이 모두 닫힐 때 `GET /api/me/session-praises/pending`을 조회해 첫 세션을 띄운다.
 * 칭찬한 세션은 서버가 빼 주고, 칭찬하지 않고 넘긴 세션은 이 기기에 기억해 다시 띄우지 않는다
 */
export default function PendingSessionPraisePopup({
  playerId,
  isActive,
  tabKey,
  onBusyChange,
}: PendingSessionPraisePopupProps): React.ReactElement | null {
  // 셸이 그리므로 화면 보임은 늘 참이고 문서가 숨은 동안만 미룬다
  const dataVersion = useDataVersion(PRAISE_DATA_KINDS);
  const [shown, setShown] = useState<ShownPraise | null>(null);
  // 마지막으로 조회를 마친 회원·데이터 버전. 같으면 다시 조회할 때까지 업적 축하를 막지 않는다
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const tabKeyRef = useRef(tabKey);
  tabKeyRef.current = tabKey;
  const isShowing = shown !== null;
  const checkKey = `${playerId}:${dataVersion}`;
  const isBusy =
    isShowing || (isActive && playerId !== null && checkedKey !== checkKey);

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  // 다른 회원으로 바뀌면 띄우던 팝업을 버린다
  useEffect(() => {
    setShown(null);
  }, [playerId]);

  useEffect(() => {
    if (!playerId || !isActive || isShowing) return;
    // 그사이 다시 조회했거나 다른 화면이 열렸으면 결과를 버린다(닫히면 다시 조회한다)
    let isCancelled = false;
    fetchPendingSessionPraises()
      .then(({ items }) => {
        if (isCancelled) return;
        const praise = pickPendingSessionPraise(
          items,
          playerId,
          readSkippedSessionPraises(),
        );
        if (praise) setShown({ praise, tabKey: tabKeyRef.current });
      })
      // 조회 실패는 알리지 않는다. 다음 조회 때 다시 시도한다
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setCheckedKey(checkKey);
      });
    return () => {
      isCancelled = true;
    };
  }, [checkKey, isActive, isShowing, playerId]);

  if (!shown || !playerId) return null;

  return (
    <SessionPraisePopup
      key={shown.praise.session.id}
      praise={shown.praise}
      tabKey={shown.tabKey}
      onSkip={() => rememberSkippedSessionPraise(playerId, shown.praise.session.id)}
      onExited={() => {
        // 닫힌 뒤 다음 세션을 다시 조회하는 동안에도 업적 축하가 기다리게 한다
        setCheckedKey(null);
        setShown(null);
      }}
    />
  );
}
