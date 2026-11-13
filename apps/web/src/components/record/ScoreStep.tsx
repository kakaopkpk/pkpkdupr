import React, { useLayoutEffect, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import HoldToConfirmButton, {
  HOLD_TO_CONFIRM_DURATION_MS,
} from "@/components/HoldToConfirmButton";
import { PkButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Form";
import {
  TeamAvatars,
  type AvatarPlayer,
} from "@/components/ui/PlayerAvatar";
import { ChevronRightIcon } from "@/components/ui/Icons";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import { isScoreTie, type ScoreDraft } from "./recordMatch.utils";
import { FooterError } from "./RecordMatchParts";

// 듀스 연장·대회 룰로 11점을 넘을 수 있어 0~30을 고른다
const SCORE_OPTIONS = Array.from({ length: 31 }, (_, n) => n);
const CHIP_SIZE = 44;
const CHIP_GAP = 6;
/** 선택 칩 왼쪽으로 몇 칸을 더 보여 줄지 */
const CHIP_LEAD = 4;
/** 점수가 비었을 때 처음 보이는 위치의 기준 점수 */
const INITIAL_SCROLL_SCORE = 9;

export interface ScoreStepProps {
  teams: [AvatarPlayer[], AvatarPlayer[]];
  score: ScoreDraft;
  onScoreChange: (score: ScoreDraft) => void;
  location: string;
  onLocationChange: (location: string) => void;
  /** 서버 오류나 "고칠 수 없는 경기예요" */
  error: string | null;
  canSave: boolean;
  isSaving: boolean;
  /** 플레이어 선택으로 돌아간다. 고른 점수·장소는 그대로 남는다 */
  onBack: () => void;
  onSave: () => void;
}

export default function ScoreStep({
  teams,
  score,
  onScoreChange,
  location,
  onLocationChange,
  error,
  canSave,
  isSaving,
  onBack,
  onSave,
}: ScoreStepProps): React.ReactElement {
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const isTie = isScoreTie(score);
  const values = [score.scoreA, score.scoreB] as const;
  const winnerIndex =
    score.scoreA === null || score.scoreB === null || isTie
      ? null
      : score.scoreA > score.scoreB
        ? 0
        : 1;
  const trimmedLocation = location.trim();
  const isSaveEnabled = canSave && !isTie && !isSaving;

  const setTeamScore = (teamIndex: 0 | 1, value: number) => {
    onScoreChange(
      teamIndex === 0
        ? { ...score, scoreA: value }
        : { ...score, scoreB: value },
    );
  };

  return (
    <>
      <BottomSheet.Header>
        <SheetTitle
          title="경기 기록"
          sub={
            <button
              type="button"
              onClick={() => setIsEditingLocation((open) => !open)}
              className="inline-flex items-center gap-0.5 text-pk-13 text-pk-sub"
            >
              {trimmedLocation || "장소 없음"}
              <ChevronRightIcon className="size-3.5 shrink-0" />
            </button>
          }
        />
      </BottomSheet.Header>
      <BottomSheet.Body className="pb-2">
        {isEditingLocation ? (
          <form
            className="shrink-0"
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmedLocation) setIsEditingLocation(false);
            }}
          >
            <TextField
              label="장소"
              value={location}
              autoFocus
              enterKeyHint="done"
              placeholder="장소 입력"
              error={!trimmedLocation}
              onChange={(event) => onLocationChange(event.target.value)}
              onBlur={() => {
                if (trimmedLocation) setIsEditingLocation(false);
              }}
            />
          </form>
        ) : null}
        {([0, 1] as const).map((teamIndex) => (
          <TeamScore
            key={teamIndex}
            players={teams[teamIndex]}
            value={values[teamIndex]}
            isWinner={winnerIndex === teamIndex}
            isLast={teamIndex === 1}
            onChange={(value) => setTeamScore(teamIndex, value)}
          />
        ))}
      </BottomSheet.Body>
      <BottomSheet.Footer>
        <FooterError
          message={isTie ? "같은 점수는 저장할 수 없어요" : error}
        />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <PkButton
            variant="ghost"
            size="lg"
            disabled={isSaving}
            onClick={onBack}
          >
            이전
          </PkButton>
          <HoldToConfirmButton
            ariaLabel="길게 눌러 저장"
            holdDurationMs={HOLD_TO_CONFIRM_DURATION_MS}
            isDisabled={!isSaveEnabled}
            onComplete={onSave}
          >
            길게 눌러 저장
          </HoldToConfirmButton>
        </div>
      </BottomSheet.Footer>
    </>
  );
}

interface TeamScoreProps {
  players: AvatarPlayer[];
  value: number | null;
  isWinner: boolean;
  isLast: boolean;
  onChange: (value: number) => void;
}

/** 팀 이름·큰 점수와 0~30 가로 점수 칩. 마운트할 때만 선택값 근처로 스크롤한다 */
const TeamScore: React.FC<TeamScoreProps> = ({
  players,
  value,
  isWinner,
  isLast,
  onChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialValueRef = useRef(value);
  // 사용자가 칩으로 점수를 바꾼 횟수. 0이면 마운트 때 있던 점수라 pop하지 않는다
  const [pickCount, setPickCount] = useState(0);
  const names = players.map((player) => player.username).join(" · ");

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = initialValueRef.current ?? INITIAL_SCROLL_SCORE;
    el.scrollLeft = Math.max(0, anchor - CHIP_LEAD) * (CHIP_SIZE + CHIP_GAP);
  }, []);

  return (
    <div
      className={cx(
        "flex shrink-0 flex-col gap-3 pt-1 pb-4",
        !isLast && "border-b border-pk-divider",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamAvatars players={players} size={28} />
          <span className="truncate text-pk-15 font-bold">{names}</span>
        </div>
        <span
          className={cx(
            "font-num text-[52px] leading-[0.9] font-bold tabular-nums transition-colors duration-180 ease-pk-move motion-reduce:transition-none",
            value === null
              ? "text-pk-quiet"
              : isWinner
                ? "text-pk-primary"
                : "text-pk-ink",
          )}
        >
          {/* 고를 때마다 key로 다시 마운트해 pop을 재생한다. 색 전환은 바깥 span이 맡는다 */}
          <span
            key={pickCount}
            className={cx(
              "inline-block",
              pickCount > 0 && "animate-pk-pop motion-reduce:animate-none",
            )}
          >
            {value ?? "–"}
          </span>
        </span>
      </div>
      <div
        ref={scrollRef}
        role="radiogroup"
        aria-label={`${names} 점수`}
        className="flex gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent_100%)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SCORE_OPTIONS.map((n) => {
          const isSelected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${n}점`}
              onClick={() => {
                if (n === value) return;
                setPickCount((count) => count + 1);
                onChange(n);
              }}
              style={{ width: CHIP_SIZE, height: CHIP_SIZE }}
              className={cx(
                "shrink-0 rounded-pk-sm text-pk-17 tabular-nums",
                isSelected
                  ? "bg-pk-primary font-extrabold text-white"
                  : "bg-pk-bg font-bold text-pk-sub",
                isSelected &&
                  pickCount > 0 &&
                  "animate-pk-pop motion-reduce:animate-none",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
};
