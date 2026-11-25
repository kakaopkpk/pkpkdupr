import React, { useState } from "react";
import type {
  SessionPraiseCandidate,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import { getErrorMessage } from "@/components/session/saveError";
import { rowPressClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckIcon, ThumbUpIcon } from "@/components/ui/Icons";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PraisedAvatarFrame } from "@/components/ui/PraisedAvatarFrame";
import { Section } from "@/components/ui/Section";
import { cx } from "@/components/ui/cx";
import { useInvalidateData } from "@/context/DataSyncContext";
import { useSystemNotice } from "@/context/SystemNoticeContext";
import { isNetworkError } from "@/lib/errors";
import { RequestError } from "@/lib/rankings";
import {
  formatSessionPraiseValue,
  getSessionPraisePillState,
  isSessionPraiseValueRising,
  praiseSessionPlayer,
  type SessionPraisePillState,
} from "@/lib/sessionPraise";
import { SessionPraiseCategoryChip } from "./SessionPraiseParts";

const PILL_CLASS_NAME: Record<SessionPraisePillState, string> = {
  open: "bg-pk-primary-soft text-pk-primary",
  picked: "bg-pk-primary text-white",
  inactive: "bg-pk-neutral text-pk-muted",
};

/** 칭찬 알약(높이 36, 최소 너비 56): 엄지(내가 고른 줄은 체크) + 받은 칭찬 수 */
export const SessionPraisePill: React.FC<{
  state: SessionPraisePillState;
  count: number;
  /** 체크를 그리듯 나타낸다(방금 칭찬한 줄) */
  drawCheck?: boolean;
}> = ({ state, count, drawCheck = false }) => (
  <span
    className={cx(
      "inline-flex h-9 min-w-14 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-pk-15 font-extrabold tabular-nums",
      PILL_CLASS_NAME[state],
    )}
  >
    {state === "picked" ? (
      <CheckIcon size={13} draw={drawCheck} />
    ) : (
      <ThumbUpIcon size={15} />
    )}
    {count}
  </span>
);

const getRowLabel = (
  candidate: SessionPraiseCandidate,
  state: SessionPraisePillState,
) => {
  const { username } = candidate.player;
  if (state === "picked") return `${username}, 내가 칭찬함, 칭찬 ${candidate.praiseCount}개`;
  if (state === "open") return `${username} 칭찬, 지금 ${candidate.praiseCount}개`;
  return `${username}, 칭찬 ${candidate.praiseCount}개`;
};

/** 칭찬 후보 줄: 아바타 36 → 분류 칩(작게)·아이디 → 값 → 칭찬 알약. 칭찬 전에는 줄 전체가 칭찬 버튼이다 */
const SessionPraiseRow: React.FC<{
  candidate: SessionPraiseCandidate;
  state: SessionPraisePillState;
  isDisabled: boolean;
  drawCheck: boolean;
  onPraise: () => void;
}> = ({ candidate, state, isDisabled, drawCheck, onPraise }) => {
  const canPress = state === "open" && !isDisabled;
  return (
    <button
      type="button"
      disabled={!canPress}
      aria-label={getRowLabel(candidate, state)}
      onClick={onPraise}
      className={cx(
        "flex min-h-16 w-full items-center gap-3 py-2.5 text-left not-last:border-b not-last:border-pk-divider disabled:cursor-default",
        canPress && rowPressClassName,
      )}
    >
      <PraisedAvatarFrame praiseCount={candidate.praiseCount}>
        <PlayerAvatar player={candidate.player} size={36} />
      </PraisedAvatarFrame>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <SessionPraiseCategoryChip category={candidate.category} size="sm" />
        <span className="max-w-full truncate text-pk-15 font-bold text-pk-ink">
          {candidate.player.username}
        </span>
      </span>
      <span className="shrink-0 text-pk-15 font-semibold tabular-nums text-pk-ink">
        {formatSessionPraiseValue(candidate.category, candidate.value, candidate.streakBreaks)}
      </span>
      <SessionPraisePill
        state={state}
        count={candidate.praiseCount}
        drawCheck={drawCheck}
      />
    </button>
  );
};

/**
 * 끝난 세션 상세의 "하이라이트" 섹션(내용은 칭찬 후보). 후보가 없으면 그리지 않는다.
 * 칭찬 전에는 줄을 눌러 칭찬하고, 칭찬한 뒤·마감 뒤에는 결과만 보인다(마감 시각·"마감" 글자는 보이지 않는다).
 * 줄 순서는 후보 순서 그대로다
 */
export const SessionPraiseSection: React.FC<{
  praise: SessionPraiseResponse;
  /** 칭찬 저장 뒤 서버가 돌려준 칭찬 상태 */
  onPraised: (next: SessionPraiseResponse) => void;
}> = ({ praise, onPraised }) => {
  const invalidateData = useInvalidateData();
  const { showSaveFailure } = useSystemNotice();
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [praisedPlayerId, setPraisedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (praise.candidates.length === 0) return null;

  const sessionId = praise.session.id;
  const praisePlayer = async (targetPlayerId: string) => {
    if (pendingPlayerId) return;
    const run = async () => {
      const next = await praiseSessionPlayer(sessionId, targetPlayerId);
      setPraisedPlayerId(targetPlayerId);
      onPraised(next);
      // 칭찬 수·칭찬 업적이 바뀐다(서버 변경 신호와 같은 종류)
      invalidateData(["sessions", "achievements"]);
    };

    setPendingPlayerId(targetPlayerId);
    setError(null);
    try {
      await run();
    } catch (err) {
      if (isNetworkError(err)) {
        showSaveFailure({ onRetry: run });
      } else {
        setError(getErrorMessage(err, "칭찬하지 못했어요."));
        // 마감됐거나 이미 칭찬했으면 지금 상태로 다시 받는다
        if (err instanceof RequestError && err.status === 409) {
          invalidateData(["sessions"]);
        }
      }
    } finally {
      setPendingPlayerId(null);
    }
  };

  return (
    <Section title="하이라이트">
      <Card>
        {praise.candidates.map((candidate) => (
          <SessionPraiseRow
            key={candidate.player.id}
            candidate={candidate}
            state={getSessionPraisePillState(praise, candidate.player.id)}
            isDisabled={pendingPlayerId !== null}
            drawCheck={praisedPlayerId === candidate.player.id}
            onPraise={() => void praisePlayer(candidate.player.id)}
          />
        ))}
      </Card>
      {error ? (
        <p role="alert" className="px-1 text-pk-13 font-medium text-pk-down">
          {error}
        </p>
      ) : null}
    </Section>
  );
};

