import React, { useState } from "react";
import { Link } from "react-router-dom";
import type {
  AdminPlayer,
  PlayerCreationLog,
  PlayerDuprCategory,
  PlayerStatusChangeLog,
} from "@pkpkdupr/shared/player";
import { updatePlayerGender, updatePlayerStatus } from "../../api/players";
import { Button } from "../../components/ui/Button";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { InlineError } from "../../components/ui/InlineError";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { useToast } from "../../components/ui/Toast";
import { ratingsPath } from "../../lib/adminRoutes";
import { formatRating } from "../../lib/format";
import {
  GENDER_LABEL,
  buildHistoryLines,
  formatCreationSummary,
  getAccountStatusText,
  getCreationLog,
  reportActionError,
  runConfirmedAction,
  type Gender,
  type RankInfo,
} from "./memberModel";
import {
  DeleteMemberSection,
  FieldHint,
  GenderControl,
  PasswordResetRow,
  UsernameEditor,
  useConfirm,
  type PanelCallbacks,
} from "./panelParts";

const CATEGORY_LABEL: Record<PlayerDuprCategory, string> = {
  doubles: "복식",
  singles: "단식",
};

const RatingTile: React.FC<{
  player: AdminPlayer;
  category: PlayerDuprCategory;
  rank: number | undefined;
}> = ({ player, category, rank }) => {
  const confidence = Math.round(player.duprMetrics[category].confidence);
  return (
    <div className="rounded-pk-sm bg-pk-bg p-3.5">
      <div className="text-pk-12 font-semibold text-pk-sub">{CATEGORY_LABEL[category]} 평점</div>
      <div className="mt-1 text-pk-22 font-bold tabular-nums text-pk-ink">
        {formatRating(player.duprRating?.[category])}
      </div>
      <div className="mt-0.5 text-pk-12 text-pk-muted">
        신뢰도 {confidence}%{rank !== undefined && ` · ${rank}위`}
      </div>
    </div>
  );
};

/** 정회원·비활성 회원 상세 패널 */
export const MemberPanel: React.FC<{
  player: AdminPlayer;
  creationLogs: PlayerCreationLog[] | undefined;
  statusLogs: PlayerStatusChangeLog[] | undefined;
  ranks: RankInfo;
  isSelf: boolean;
  topSlot: React.ReactNode;
  callbacks: PanelCallbacks;
  onClose: () => void;
}> = ({ player, creationLogs, statusLogs, ranks, isSelf, topSlot, callbacks, onClose }) => {
  const { showToast } = useToast();
  const { requestConfirm, confirmDialog } = useConfirm();
  const [genderDraft, setGenderDraft] = useState<Gender | "">(player.gender ?? "");
  const [genderPending, setGenderPending] = useState(false);
  const [genderError, setGenderError] = useState<string | null>(null);

  const inactive = player.status === "inactive";
  const creationLog = getCreationLog(creationLogs);
  const historyLines = buildHistoryLines(creationLogs, statusLogs);
  const hasStatusLogs = (statusLogs?.length ?? 0) > 0;
  const accountStatusText = getAccountStatusText(player);

  const subtitle = [
    "정회원",
    player.gender ? GENDER_LABEL[player.gender] : null,
    inactive ? "비활성" : "활성",
    creationLog ? formatCreationSummary(creationLog) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const requestStatusChange = () => {
    const nextStatus = inactive ? "active" : "inactive";
    requestConfirm({
      title: inactive ? "활성화" : "비활성으로 바꾸기",
      description: inactive
        ? `${player.username}를 활성화할까요? 원래 비밀번호로 다시 로그인할 수 있어요.`
        : `${player.username}를 비활성으로 바꿀까요? 로그인할 수 없고 랭킹·선수 목록에서 빠져요.`,
      confirmLabel: inactive ? "활성화" : "비활성으로 바꾸기",
      onConfirm: () =>
        runConfirmedAction(async () => {
          await updatePlayerStatus(player.id, nextStatus);
          showToast(
            nextStatus === "inactive"
              ? `${player.username}를 비활성으로 바꿨어요`
              : `${player.username}를 활성화했어요`,
          );
          await callbacks.reload();
        }, showToast),
    });
  };

  const handleGenderSave = async () => {
    if (!genderDraft) return;
    setGenderPending(true);
    setGenderError(null);
    try {
      await updatePlayerGender(player.id, genderDraft);
      showToast(`${player.username} 성별을 ${GENDER_LABEL[genderDraft]}로 바꿨어요`);
      await callbacks.reload();
    } catch (err) {
      reportActionError(err, setGenderError, showToast);
    } finally {
      setGenderPending(false);
    }
  };

  return (
    <DetailPanel
      leading={<PlayerAvatar player={player} size={40} />}
      title={player.username}
      subtitle={subtitle}
      onClose={onClose}
    >
      {topSlot}

      <div className="grid grid-cols-2 gap-2.5">
        <RatingTile player={player} category="doubles" rank={ranks.doubles.get(player.id)} />
        <RatingTile player={player} category="singles" rank={ranks.singles.get(player.id)} />
      </div>

      <PanelSection title="계정">
        <div className="space-y-4">
          {accountStatusText && (
            <div className="text-pk-13 tabular-nums text-pk-sub">{accountStatusText}</div>
          )}
          <UsernameEditor
            player={player}
            buttonLabel="아이디 변경"
            hint="바꾸면 회원은 새 아이디로 로그인해요. 값을 고쳐야 버튼이 켜져요."
            reload={callbacks.reload}
          />
          <div>
            <PasswordResetRow
              player={player}
              subject="회원은"
              disabled={inactive}
              requestConfirm={requestConfirm}
              callbacks={callbacks}
            />
            {inactive && (
              <FieldHint>먼저 활성화해야 비밀번호를 초기화할 수 있어요.</FieldHint>
            )}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="정보">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-pk-13 text-pk-sub">성별</span>
              <div className="flex items-center gap-2">
                {genderDraft && genderDraft !== player.gender && (
                  <Button
                    size="sm"
                    disabled={genderPending}
                    onClick={() => void handleGenderSave()}
                  >
                    {genderPending ? "저장 중…" : "저장"}
                  </Button>
                )}
                <GenderControl
                  value={genderDraft}
                  onChange={(next) => {
                    setGenderDraft(next);
                    setGenderError(null);
                  }}
                />
              </div>
            </div>
            <div className="mt-1.5">
              <InlineError message={genderError} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-pk-13 text-pk-sub">
                상태 · <span className="font-semibold text-pk-ink">{inactive ? "비활성" : "활성"}</span>
              </span>
              <Button variant="outline" onClick={requestStatusChange}>
                {inactive ? "활성화" : "비활성으로 바꾸기"}
              </Button>
            </div>
            <FieldHint>
              비활성이면 로그인할 수 없고 랭킹·선수 목록에서 빠져요. 다시 활성화하면 원래
              비밀번호로 로그인해요.
            </FieldHint>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="평점">
        <Link
          to={ratingsPath({ playerId: player.id })}
          className="text-pk-13 font-bold text-pk-primary hover:underline"
        >
          {player.username} 공식 DUPR 반영 ›
        </Link>
      </PanelSection>

      <PanelSection title="회원 삭제">
        <DeleteMemberSection
          player={player}
          isSelf={isSelf}
          requestConfirm={requestConfirm}
          onDeleted={callbacks.onDeleted}
        />
      </PanelSection>

      <PanelSection title="변경 기록">
        <ul className="space-y-1 text-pk-13 text-pk-sub">
          {historyLines.map((line) => (
            <li key={line.id} className="tabular-nums">
              {line.text}
            </li>
          ))}
          {!hasStatusLogs && <li className="text-pk-muted">상태 변경 기록 없음</li>}
        </ul>
      </PanelSection>

      {confirmDialog}
    </DetailPanel>
  );
};
