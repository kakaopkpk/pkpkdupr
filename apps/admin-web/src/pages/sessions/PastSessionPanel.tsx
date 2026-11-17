import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ManagedMatchSession, Match } from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { MatchSessionReport, SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import { fetchSessionReport } from "../../api/sessions";
import { DetailPanel, PanelSection } from "../../components/ui/DetailPanel";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { RatingDelta } from "../../components/ui/RatingDelta";
import { matchesPath } from "../../lib/adminRoutes";
import { formatRatingDelta } from "../../lib/format";
import { getLoadErrorMessage } from "./sessionErrors";
import { formatSessionSubtitle, PanelStatus, SessionPanelTitle } from "./SessionPanelParts";

const TOP_MOVERS_LIMIT = 5;

/** 평점 변화량 절댓값이 큰 순(같으면 아이디 순). 변화가 없는 회원과 세션 지배자는 뺀다 */
const getTopMovers = (report: MatchSessionReport): SessionPlayerReport[] =>
  report.players
    .filter(
      (row) =>
        formatRatingDelta(row.ratingDelta) !== "0.000" &&
        row.player.id !== report.topRiser?.player.id,
    )
    .sort(
      (a, b) =>
        Math.abs(b.ratingDelta) - Math.abs(a.ratingDelta) ||
        a.player.username.localeCompare(b.player.username),
    )
    .slice(0, TOP_MOVERS_LIMIT);

const CountLine: React.FC<{ label: string; value: number; extra?: string | null }> = ({
  label,
  value,
  extra,
}) => (
  <p className="text-pk-15 text-pk-ink">
    <span className="font-bold">{label}</span>{" "}
    <span className="font-bold tabular-nums">{value}</span>
    {extra && <span className="text-pk-sub"> · {extra}</span>}
  </p>
);

/** 지난 세션 패널(보기 전용). 수정·삭제·참여자 편집이 없다 */
export const PastSessionPanel: React.FC<{
  session: ManagedMatchSession;
  players: AdminPlayer[];
  /** 관리자 경기 목록. 세션의 평점 미반영 경기 수를 센다 */
  loadMatches: () => Promise<Match[]>;
  onClose: () => void;
}> = ({ session, players, loadMatches, onClose }) => {
  const [report, setReport] = useState<MatchSessionReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excludedCount, setExcludedCount] = useState<number | null>(null);

  useEffect(() => {
    let canceled = false;
    setReport(null);
    setLoadError(null);
    setExcludedCount(null);
    fetchSessionReport(session.id)
      .then((next) => {
        if (!canceled) setReport(next);
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setLoadError(getLoadErrorMessage(err, "세션 기록을 불러오지 못했어요."));
        }
      });
    // 미반영 경기 수는 보조 정보라 실패하면 생략한다
    loadMatches()
      .then((matches) => {
        if (canceled) return;
        setExcludedCount(
          matches.filter(
            (match) =>
              match.session?.id === session.id &&
              match.status === "completed" &&
              match.ratingExcluded,
          ).length,
        );
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [session.id, loadMatches]);

  const guestCount = useMemo(() => {
    const guestIds = new Set(
      players.filter((player) => player.isGuest).map((player) => player.id),
    );
    return session.participantIds.filter((id) => guestIds.has(id)).length;
  }, [players, session.participantIds]);

  const topMovers = useMemo(() => (report ? getTopMovers(report) : []), [report]);
  const matchCount = report?.session.matchCount ?? session.matchCount;

  return (
    <DetailPanel
      title={<SessionPanelTitle session={session} />}
      subtitle={formatSessionSubtitle(session, "끝남")}
      onClose={onClose}
    >
      <section className="space-y-1">
        <CountLine
          label="경기"
          value={matchCount}
          extra={excludedCount ? `평점 미반영 ${excludedCount}` : null}
        />
        <CountLine
          label="참여자"
          value={session.participantIds.length}
          extra={guestCount ? `게스트 ${guestCount}` : null}
        />
      </section>

      {!report ? (
        <PanelStatus>{loadError ?? "세션 기록을 불러오는 중…"}</PanelStatus>
      ) : (
        <>
          {report.topRiser && (
            <PanelSection title="세션 지배자">
              <div className="flex items-center gap-2.5">
                <PlayerAvatar player={report.topRiser.player} size={32} />
                <span className="min-w-0 flex-1 truncate text-pk-15 font-bold text-pk-ink">
                  {report.topRiser.player.username}
                </span>
                <RatingDelta value={report.topRiser.ratingDelta} className="text-pk-15" />
              </div>
            </PanelSection>
          )}

          {topMovers.length > 0 && (
            <PanelSection title="평점 변화 많은 순">
              <ul className="space-y-1.5">
                {topMovers.map((row) => (
                  <li key={row.player.id} className="flex items-center gap-2 text-pk-15">
                    <span className="min-w-0 flex-1 truncate font-semibold text-pk-ink">
                      {row.player.username}
                    </span>
                    <RatingDelta value={row.ratingDelta} />
                  </li>
                ))}
              </ul>
            </PanelSection>
          )}
        </>
      )}

      <Link
        to={matchesPath({ sessionId: session.id })}
        className="inline-block text-pk-15 font-bold text-pk-primary hover:underline focus-visible:outline-2 focus-visible:outline-pk-primary"
      >
        이 세션 경기 {matchCount}개 보기 ›
      </Link>

      <PanelStatus>
        지난 세션은 취소·삭제하지 않아요. 경기를 고치려면 경기 화면에서 정정해요.
      </PanelStatus>
    </DetailPanel>
  );
};
