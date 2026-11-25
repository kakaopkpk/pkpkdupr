import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import type { SessionPraiseResponse } from "@pkpkdupr/shared/sessionPraise";
import { getAchievementDefinition } from "@/lib/achievements";
import {
  formatKstFullDateWithWeekday,
  formatKstShortDate,
} from "@/lib/format";
import type { MatchSessionReportInfo } from "@/lib/rankings";
import type { SessionPraiseValue } from "@/lib/sessionPraise";
import { toShareFileName } from "@/lib/shareImage";

/*
 * 끝난 세션 리포트의 공유 이미지 내용. 단톡방용 "세션 요약"과 개인용 "내 기록" 두 가지이고,
 * 모양은 docs/design.md "세션 리포트 공유", 넣는 조건은 docs/product.md "세션 리포트 공유"를 따른다.
 */

/** 세션 요약 아래 줄 왼쪽 이름(동호회) */
export const SESSION_SHARE_CLUB_NAME = "피카피카";
/** 세션 요약 평점 상승 줄 수 */
export const SESSION_SHARE_TOP_RISER_COUNT = 3;
/** 내 기록에 그리는 새 업적 줄 수. 넘치면 "외 N개" 줄을 붙인다 */
export const SESSION_SHARE_ACHIEVEMENT_LIMIT = 3;

export type SessionReportShareKind = "summary" | "mine";

export interface SessionReportSharePlayer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface SessionReportShareSession {
  id: string;
  name: string;
  /** 세션 날짜(ISO) */
  date: string;
  location: string;
}

export interface SessionReportShareRiser {
  player: SessionReportSharePlayer;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  matchCount: number;
  wins: number;
}

/** 칭찬 후보 한 명. 분류·값·칭찬 수는 후보 그대로다 */
export interface SessionReportSharePraise extends SessionPraiseValue {
  player: SessionReportSharePlayer;
  praiseCount: number;
}

export interface SessionSummaryShareTarget {
  kind: "summary";
  session: SessionReportShareSession;
  participantCount: number;
  matchCount: number;
  /** 평점이 오른 회원 상승폭 순 최대 3명. 없으면 섹션을 뺀다 */
  risers: SessionReportShareRiser[];
  /** 마감 뒤 칭찬 후보 전부(후보 순서, 칭찬 0개 포함). 없으면 섹션을 뺀다 */
  praised: SessionReportSharePraise[];
}

export interface MyRecordShareTarget {
  kind: "mine";
  session: SessionReportShareSession;
  username: string;
  /** 세션 후 복식 평점. 복식 NR이면 null */
  ratingAfter: number | null;
  /** 세션 평점 변화. 전후 평점 중 하나라도 없으면 null */
  ratingDelta: number | null;
  /** 세션 후 복식 순위. 없으면 null이라 랭킹 알약을 뺀다 */
  rankAfter: number | null;
  /** 순위 변동(양수가 오름). 세션 전 순위가 없으면 null */
  rankChange: number | null;
  wins: number;
  losses: number;
  /** 마감 뒤 내가 후보이고 칭찬을 1개 이상 받았으면 그 후보 정보. 아니면 null이라 칭찬 상자를 뺀다 */
  praise: Omit<SessionReportSharePraise, "player"> | null;
  /** 이 세션에서 받은 업적 id(받은 순서) */
  achievementIds: string[];
}

export type SessionReportShareTarget = SessionSummaryShareTarget | MyRecordShareTarget;

const toSharePlayer = ({ id, username, avatarUrl }: SessionReportSharePlayer) => ({
  id,
  username,
  avatarUrl: avatarUrl ?? null,
});

const toShareSession = (report: MatchSessionReportInfo): SessionReportShareSession => ({
  id: report.session.id,
  name: report.session.name,
  date: report.session.date,
  location: report.session.location,
});

/** 소수 셋째 자리에서 0이 되는 변화는 보합으로 본다 */
const roundDelta = (value: number) => Math.round(value * 1000) / 1000;

/**
 * 마감 뒤 칭찬 후보 전부(칭찬 수와 상관없이 세션 상세 하이라이트와 같은 후보).
 * 마감 전이거나 칭찬하지 않는 세션(praise null)이면 빈 배열이다. 마감 전 수는 아직 바뀔 수 있어 공유 이미지에 넣지 않는다
 */
export const getSharedPraisedCandidates = (
  praise: SessionPraiseResponse | null,
): SessionReportSharePraise[] =>
  praise?.status === "closed"
    ? praise.candidates.map((candidate) => ({
        player: toSharePlayer(candidate.player),
        category: candidate.category,
        value: candidate.value,
        streakBreaks: candidate.streakBreaks,
        praiseCount: candidate.praiseCount,
      }))
    : [];

/** 평점이 오른 회원 상승폭 순 최대 3명. 리포트 players는 ratingDelta 내림차순이다 */
const getTopRisers = (players: readonly SessionPlayerReport[]): SessionReportShareRiser[] =>
  players
    .flatMap((entry) =>
      entry.ratingBefore !== null && entry.ratingAfter !== null && roundDelta(entry.ratingDelta) > 0
        ? [
            {
              player: toSharePlayer(entry.player),
              ratingBefore: entry.ratingBefore,
              ratingAfter: entry.ratingAfter,
              ratingDelta: entry.ratingDelta,
              matchCount: entry.matchCount,
              wins: entry.wins,
            },
          ]
        : [],
    )
    .sort((left, right) => right.ratingDelta - left.ratingDelta)
    .slice(0, SESSION_SHARE_TOP_RISER_COUNT);

export const buildSessionSummaryShareTarget = (
  report: MatchSessionReportInfo,
  praise: SessionPraiseResponse | null,
): SessionSummaryShareTarget => ({
  kind: "summary",
  session: toShareSession(report),
  participantCount: report.session.participantCount,
  matchCount: report.session.matchCount,
  risers: getTopRisers(report.players),
  praised: getSharedPraisedCandidates(praise),
});

/** 내 기록. 내가 그 세션에서 경기하지 않았으면 null이다 */
export const buildMyRecordShareTarget = (
  report: MatchSessionReportInfo,
  praise: SessionPraiseResponse | null,
  player: { id: string; username: string } | null,
): MyRecordShareTarget | null => {
  if (!player) return null;
  const mine = report.players.find(
    (entry) => entry.player.id === player.id && entry.matchCount > 0,
  );
  if (!mine) return null;
  const myPraise = getSharedPraisedCandidates(praise).find(
    (candidate) => candidate.player.id === player.id && candidate.praiseCount > 0,
  );
  return {
    kind: "mine",
    session: toShareSession(report),
    username: player.username,
    ratingAfter: mine.ratingAfter,
    ratingDelta:
      mine.ratingBefore !== null && mine.ratingAfter !== null ? mine.ratingDelta : null,
    rankAfter: mine.rankAfter,
    rankChange:
      mine.rankBefore !== null && mine.rankAfter !== null
        ? mine.rankBefore - mine.rankAfter
        : null,
    wins: mine.wins,
    losses: mine.losses,
    praise: myPraise
      ? {
          category: myPraise.category,
          value: myPraise.value,
          streakBreaks: myPraise.streakBreaks,
          praiseCount: myPraise.praiseCount,
        }
      : null,
    achievementIds: report.achievements
      .filter(
        (item) =>
          item.playerId === player.id && getAchievementDefinition(item.achievementId) !== null,
      )
      .map((item) => item.achievementId),
  };
};

/** 이름 아래 줄 "11월 18일 수 · 야탑초등학교". 장소가 없으면 날짜만 */
export const getSessionShareMetaLabel = (session: SessionReportShareSession) => {
  const date = formatKstShortDate(session.date);
  const location = session.location.trim();
  return location ? `${date} · ${location}` : date;
};

/** 아래 줄 날짜 "2026년 11월 18일 수" */
export const getSessionShareDateLabel = (session: SessionReportShareSession) =>
  formatKstFullDateWithWeekday(session.date);

/** 세션 요약 평점 줄 둘째 줄의 "N경기 N승" */
export const formatRiserRecord = (riser: Pick<SessionReportShareRiser, "matchCount" | "wins">) =>
  `${riser.matchCount}경기 ${riser.wins}승`;

/** 공유 시트에 함께 보내는 문구 */
export const getSessionReportShareText = (target: SessionReportShareTarget) =>
  target.kind === "summary"
    ? `${target.session.name} 세션 요약이에요`
    : `${target.username}님의 ${target.session.name} 기록이에요`;

/** 공유·내려받기 파일 이름 */
export const getSessionReportShareFileName = (target: SessionReportShareTarget) =>
  target.kind === "summary"
    ? toShareFileName("session", target.session.id)
    : toShareFileName("session", target.session.id, "me");

/** 같은 이미지인지 가르는 값. 이 값이 바뀔 때만 이미지를 다시 만든다 */
export const getSessionReportShareKey = (target: SessionReportShareTarget) =>
  JSON.stringify(target);
