import React from "react";
import BottomSheet from "@/components/BottomSheet";
import HoldToConfirmButton from "@/components/HoldToConfirmButton";
import { FooterError } from "@/components/record/RecordMatchParts";
import { PkButton } from "@/components/ui/Button";
import { TeamAvatars } from "@/components/ui/PlayerAvatar";
import { SheetTitle } from "@/components/ui/SheetTitle";
import { cx } from "@/components/ui/cx";
import { GLOBAL_LAYER } from "@/context/AppNavigationContext";
import { formatKstShortDate, formatKstTime } from "@/lib/format";
import { getTeamResultScores, type MatchInfo } from "@/types/match";

export interface DeleteMatchSheetProps {
  isOpen: boolean;
  isActive: boolean;
  /** 지울 경기. 닫히는 동안에도 마지막 경기를 그린다 */
  match: MatchInfo | null;
  isDeleting: boolean;
  /** 버튼 위에 보일 서버 문구(409 등) */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** "11월 13일 목 20:01 · 목요 정기운동" */
const getMatchDateLine = (match: MatchInfo) => {
  const dateTime = `${formatKstShortDate(match.matchStartsAt)} ${formatKstTime(match.matchStartsAt)}`;
  const sessionName = match.session?.name?.trim();
  return sessionName ? `${dateTime} · ${sessionName}` : dateTime;
};

/** 요약 상자의 팀 한 줄. 이긴 팀은 진한 글자, 진 팀은 회색이다 */
const TeamLine: React.FC<{
  team: MatchInfo["teams"][number];
  score: number | null;
  isLoser: boolean;
}> = ({ team, score, isLoser }) => (
  <div
    className={cx(
      "flex items-center gap-2.5",
      isLoser ? "text-pk-muted" : "text-pk-ink",
    )}
  >
    <TeamAvatars players={team.players} size={22} ringColor="var(--color-pk-bg)" />
    <span
      className={cx(
        "min-w-0 flex-1 truncate text-pk-15",
        isLoser ? "font-medium" : "font-bold",
      )}
    >
      {team.players.map((player) => player.username).join(" · ")}
    </span>
    <span className="text-pk-17 font-extrabold tabular-nums">
      {score ?? "–"}
    </span>
  </div>
);

const MatchSummary: React.FC<{ match: MatchInfo }> = ({ match }) => {
  const hasScores = (match.scores?.length ?? 0) > 0;
  const scores = getTeamResultScores(match);
  const loserIndex =
    !hasScores || scores[0] === scores[1] ? null : scores[0] > scores[1] ? 1 : 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-pk-lg bg-pk-bg px-4 py-3.5">
      <p className="text-pk-12 text-pk-muted tabular-nums">
        {getMatchDateLine(match)}
      </p>
      {match.teams.map((team, index) => (
        <TeamLine
          key={team.id}
          team={team}
          score={hasScores ? scores[index] : null}
          isLoser={loserIndex === index}
        />
      ))}
    </div>
  );
};

/** 경기 삭제 확인 시트. 경기 상세 화면 위에 뜨며, 1초 길게 눌러야 지운다 */
export default function DeleteMatchSheet({
  isOpen,
  isActive,
  match,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteMatchSheetProps): React.ReactElement {
  return (
    <BottomSheet
      isOpen={isOpen}
      isActive={isActive}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen && !isDeleting) onCancel();
      }}
      ariaLabel="경기 삭제"
      layer={GLOBAL_LAYER.sheet}
      isFixedHeight={false}
    >
      <BottomSheet.Header>
        <SheetTitle title="경기를 삭제할까요?" />
      </BottomSheet.Header>
      <BottomSheet.Body className="gap-3">
        {match ? <MatchSummary match={match} /> : null}
        <p className="px-1 text-pk-13 text-pk-sub">
          이 경기와 그 뒤 경기를 한 회원들의 평점이 다시 계산돼요. 삭제한 경기는
          되돌릴 수 없어요.
        </p>
      </BottomSheet.Body>
      <BottomSheet.Footer>
        <FooterError message={error} />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <PkButton
            variant="ghost"
            size="lg"
            disabled={isDeleting}
            onClick={onCancel}
          >
            취소
          </PkButton>
          <HoldToConfirmButton
            variant="danger"
            isDisabled={isDeleting || !match}
            onComplete={onConfirm}
          >
            길게 눌러 삭제
          </HoldToConfirmButton>
        </div>
      </BottomSheet.Footer>
    </BottomSheet>
  );
}
