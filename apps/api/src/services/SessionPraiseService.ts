import { getSessionEndsAt } from "@pkpkdupr/shared/session";
import {
  buildSessionPraisePlayerStats,
  getSessionPraiseStatus,
  isSessionPraiseEnabled,
  pickSessionPraiseCandidates,
  type SessionPraiseCandidate,
  type SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import {
  buildSessionPlayerReports,
  isRankablePlayer,
  pickTopRiser,
  toRankingPlayer,
  type RankingContext,
  type RankingMatch,
  type RankingSession,
} from "./RankingService";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";

/** 세션 끝 시각(getSessionEndsAt). 칭찬은 이 시각부터 1시간 받는다 */
export const getRankingSessionEndsAt = (session: RankingSession) =>
  getSessionEndsAt(session.kind, session.date, session);

/**
 * 세션 칭찬 후보(우선순위 순)와 지금 받은 칭찬 수.
 * 후보 계산은 세션 완료 경기 전체(게스트가 낀 평점 미반영 경기 포함)로 하고, 세션 지배자·평점 변화·순위는 세션 리포트와 같다.
 * 후보는 지금 활성 정회원만이다. 칭찬하지 않는 세션(배포 전에 끝남)·끝나기 전 세션은 빈 배열이다.
 */
export const buildSessionPraiseCandidates = (
  context: RankingContext,
  session: RankingSession,
  now: Date,
  /** 이미 계산한 세션 경기·세션 리포트(소식 피드). 없으면 여기서 계산한다 */
  computed?: {
    sessionMatches: RankingMatch[];
    reports: SessionPlayerReport[] | null;
  },
): SessionPraiseCandidate[] => {
  const endsAt = getRankingSessionEndsAt(session);
  if (
    !isSessionPraiseEnabled(endsAt) ||
    getSessionPraiseStatus(endsAt, now) === "upcoming"
  ) {
    return [];
  }
  const sessionMatches =
    computed?.sessionMatches ??
    context.matches.filter((match) => match.sessionId === session.id);
  const reports = computed
    ? computed.reports
    : buildSessionPlayerReports(context, session, sessionMatches);
  if (!reports) return [];

  const statsByPlayerId = buildSessionPraisePlayerStats(
    sessionMatches,
    context.matches,
  );
  const praiseCounts = new Map<string, number>();
  for (const praise of session.praises ?? []) {
    praiseCounts.set(
      praise.targetPlayerId,
      (praiseCounts.get(praise.targetPlayerId) ?? 0) + 1,
    );
  }

  const picked = pickSessionPraiseCandidates({
    dominatorId: pickTopRiser(reports)?.player.id ?? null,
    players: reports.flatMap((report) => {
      const player = context.playersById.get(report.player.id);
      const stats = statsByPlayerId.get(report.player.id);
      return player && stats && isRankablePlayer(player)
        ? [
            {
              playerId: player.id,
              username: player.username,
              stats,
              ratingDelta: report.ratingDelta,
              rankBefore: report.rankBefore,
              rankAfter: report.rankAfter,
            },
          ]
        : [];
    }),
  });
  return picked.map((item) => ({
    player: toRankingPlayer(context.playersById.get(item.playerId)!),
    category: item.category,
    value: item.value,
    praiseCount: praiseCounts.get(item.playerId) ?? 0,
  }));
};

/** 세션 칭찬 응답(요청자 기준 myTargetPlayerId) */
export const buildSessionPraiseResponse = (
  context: RankingContext,
  session: RankingSession,
  viewerId: string,
  now: Date,
): SessionPraiseResponse => ({
  session: { id: session.id, name: session.name, kind: session.kind },
  status: getSessionPraiseStatus(getRankingSessionEndsAt(session), now),
  candidates: buildSessionPraiseCandidates(context, session, now),
  myTargetPlayerId:
    session.praises?.find((praise) => praise.voterPlayerId === viewerId)
      ?.targetPlayerId ?? null,
});

/**
 * 팝업으로 띄울 세션: 요청자가 참여자이고, 칭찬을 받는 중이며, 아직 칭찬하지 않았고, 후보가 2명 이상인 세션.
 * 세션 끝 시각 최신순이다.
 */
export const findPendingSessionPraises = (
  context: RankingContext,
  sessions: readonly RankingSession[],
  viewerId: string,
  now: Date,
): SessionPraiseResponse[] =>
  sessions
    .filter(
      (session) =>
        session.participantIds.includes(viewerId) &&
        getSessionPraiseStatus(getRankingSessionEndsAt(session), now) ===
          "open" &&
        !session.praises?.some((praise) => praise.voterPlayerId === viewerId),
    )
    .sort(
      (left, right) =>
        getRankingSessionEndsAt(right).getTime() -
        getRankingSessionEndsAt(left).getTime(),
    )
    .map((session) => buildSessionPraiseResponse(context, session, viewerId, now))
    .filter((response) => response.candidates.length >= 2);
