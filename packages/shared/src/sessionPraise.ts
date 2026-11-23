import { compareCountedMatches, sumPoints } from "./achievements.js";
import { getWinningTeamIndex, type MatchScore } from "./match.js";
import type { RankingPlayer } from "./ranking.js";
import type { MatchSessionKind } from "./session.js";

/** 칭찬 후보 분류. 배열 순서가 우선순위다(위에서부터 최대 3장, 같은 사람은 높은 분류 한 장) */
export const SESSION_PRAISE_CATEGORIES = [
  "dominator",
  "winStreak",
  "streakGuard",
  "mostWins",
  "rankJump",
  "mostPoints",
] as const;

export type SessionPraiseCategory = (typeof SESSION_PRAISE_CATEGORIES)[number];

export const SESSION_PRAISE_CATEGORY_LABEL: Record<SessionPraiseCategory, string> = {
  dominator: "세션 지배자",
  winStreak: "최다 연승",
  streakGuard: "연승 문지기",
  mostWins: "최다 승리",
  rankJump: "순위 도약",
  mostPoints: "최다 득점",
};

/** 한 세션의 칭찬 후보 수 상한 */
export const SESSION_PRAISE_MAX_CANDIDATES = 3;
/** 최다 연승 후보가 되는 세션 안 최소 연승 */
export const SESSION_PRAISE_WIN_STREAK_MIN = 3;
/** 연승 문지기: 이 연승 이상 중인 상대를 이기면 연승을 끊은 것으로 센다 */
export const SESSION_PRAISE_GUARDED_STREAK_MIN = 2;
/** 연승 문지기 후보가 되는 최소 연승 저지 횟수 */
export const SESSION_PRAISE_STREAK_GUARD_MIN = 2;
/** 순위 도약 후보가 되는 최소 상승 계단 수 */
export const SESSION_PRAISE_RANK_JUMP_MIN = 3;
/** 이 수 이상 칭찬받으면 세션 상세·소식에서 강조하고 칭찬 업적에 센다 */
export const SESSION_PRAISE_HIGHLIGHT_MIN = 5;
/** 칭찬 마감: 세션 끝 시각부터 24시간 */
export const SESSION_PRAISE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 이 시각 뒤에 끝난 세션부터 칭찬한다(기능 배포일 00:00 KST). 그 전 세션에는 칭찬 섹션이 없다 */
export const SESSION_PRAISE_START = new Date("2026-11-23T15:00:00.000Z");

/** 칭찬 후보 계산에 쓰는 세션 완료 경기(게스트가 낀 평점 미반영 경기 포함) */
export interface SessionPraiseMatch {
  id: string;
  completedAt: Date;
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  scores: readonly MatchScore[];
}

/** 세션 안 선수별 기록 */
export interface SessionPraisePlayerStats {
  matchCount: number;
  wins: number;
  /** 세션 안 최고 연승. 승패가 갈리지 않은 경기는 연승을 끊는다 */
  bestStreak: number;
  /** 세션 안에서 SESSION_PRAISE_GUARDED_STREAK_MIN 연승 이상 중인 상대를 이긴 경기 수(경기마다 한 번) */
  streakBreaks: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** 세션 완료 경기로 선수별 세션 기록을 센다(완료 시각 순) */
export const buildSessionPraisePlayerStats = (
  matches: readonly SessionPraiseMatch[],
): Map<string, SessionPraisePlayerStats> => {
  const statsByPlayerId = new Map<string, SessionPraisePlayerStats>();
  const streakByPlayerId = new Map<string, number>();
  const getStats = (playerId: string) => {
    let stats = statsByPlayerId.get(playerId);
    if (!stats) {
      stats = {
        matchCount: 0,
        wins: 0,
        bestStreak: 0,
        streakBreaks: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };
      statsByPlayerId.set(playerId, stats);
    }
    return stats;
  };

  for (const match of [...matches].sort(compareCountedMatches)) {
    const winner = getWinningTeamIndex(match);
    const teams = match.teamPlayerIds.map((team) => [...new Set(team)]) as [
      string[],
      string[],
    ];
    const brokeStreak =
      winner !== null &&
      teams[winner === 0 ? 1 : 0].some(
        (playerId) =>
          (streakByPlayerId.get(playerId) ?? 0) >=
          SESSION_PRAISE_GUARDED_STREAK_MIN,
      );
    teams.forEach((team, index) => {
      const teamIndex = index as 0 | 1;
      for (const playerId of team) {
        const stats = getStats(playerId);
        stats.matchCount += 1;
        stats.pointsFor += sumPoints(match.scores, teamIndex);
        stats.pointsAgainst += sumPoints(
          match.scores,
          teamIndex === 0 ? 1 : 0,
        );
        if (winner === teamIndex) {
          stats.wins += 1;
          if (brokeStreak) stats.streakBreaks += 1;
          const streak = (streakByPlayerId.get(playerId) ?? 0) + 1;
          streakByPlayerId.set(playerId, streak);
          stats.bestStreak = Math.max(stats.bestStreak, streak);
        } else {
          streakByPlayerId.set(playerId, 0);
        }
      }
    });
  }
  return statsByPlayerId;
};

/** 후보 고르기 입력: 후보가 될 수 있는 회원(정회원)마다 하나 */
export interface SessionPraisePlayerInput {
  playerId: string;
  username: string;
  stats: SessionPraisePlayerStats;
  /** 세션 복식 평점 변화(세션 리포트 ratingDelta) */
  ratingDelta: number;
  rankBefore: number | null;
  rankAfter: number | null;
}

export interface PickedSessionPraiseCandidate {
  playerId: string;
  category: SessionPraiseCategory;
  /** 분류의 값: 평점 상승폭·연승·저지 수·승 수·오른 계단 수·득점 */
  value: number;
}

const getRankJump = (input: SessionPraisePlayerInput) =>
  input.rankBefore != null && input.rankAfter != null
    ? input.rankBefore - input.rankAfter
    : 0;

const getPointDiff = (input: SessionPraisePlayerInput) =>
  input.stats.pointsFor - input.stats.pointsAgainst;

const getWinRate = (input: SessionPraisePlayerInput) =>
  input.stats.matchCount > 0 ? input.stats.wins / input.stats.matchCount : 0;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** 마지막 동점 처리: 평점 변화가 큰 사람 → 아이디 순 */
const compareRest = (
  left: SessionPraisePlayerInput,
  right: SessionPraisePlayerInput,
) =>
  right.ratingDelta - left.ratingDelta ||
  compareText(left.username, right.username) ||
  compareText(left.playerId, right.playerId);

interface CategoryRule {
  value: (input: SessionPraisePlayerInput) => number;
  isEligible: (input: SessionPraisePlayerInput) => boolean;
  /** 앞에 올 사람이 음수 */
  compare: (
    left: SessionPraisePlayerInput,
    right: SessionPraisePlayerInput,
  ) => number;
}

const CATEGORY_RULES: Record<
  Exclude<SessionPraiseCategory, "dominator">,
  CategoryRule
> = {
  winStreak: {
    value: (input) => input.stats.bestStreak,
    isEligible: (input) =>
      input.stats.bestStreak >= SESSION_PRAISE_WIN_STREAK_MIN,
    compare: (left, right) =>
      right.stats.bestStreak - left.stats.bestStreak ||
      getPointDiff(right) - getPointDiff(left) ||
      compareRest(left, right),
  },
  streakGuard: {
    value: (input) => input.stats.streakBreaks,
    isEligible: (input) =>
      input.stats.streakBreaks >= SESSION_PRAISE_STREAK_GUARD_MIN,
    compare: (left, right) =>
      right.stats.streakBreaks - left.stats.streakBreaks ||
      getPointDiff(right) - getPointDiff(left) ||
      compareRest(left, right),
  },
  mostWins: {
    value: (input) => input.stats.wins,
    isEligible: (input) => input.stats.wins > 0,
    compare: (left, right) =>
      right.stats.wins - left.stats.wins ||
      getWinRate(right) - getWinRate(left) ||
      getPointDiff(right) - getPointDiff(left) ||
      compareRest(left, right),
  },
  rankJump: {
    value: getRankJump,
    isEligible: (input) => getRankJump(input) >= SESSION_PRAISE_RANK_JUMP_MIN,
    compare: (left, right) =>
      getRankJump(right) - getRankJump(left) ||
      (left.rankAfter ?? Infinity) - (right.rankAfter ?? Infinity) ||
      compareText(left.username, right.username) ||
      compareText(left.playerId, right.playerId),
  },
  mostPoints: {
    value: (input) => input.stats.pointsFor,
    isEligible: (input) => input.stats.pointsFor > 0,
    compare: (left, right) =>
      right.stats.pointsFor - left.stats.pointsFor ||
      getPointDiff(right) - getPointDiff(left) ||
      compareRest(left, right),
  },
};

/**
 * 칭찬 후보를 고른다. 분류 우선순위대로 각 분류 1등(이미 뽑힌 사람은 건너뜀)을 뽑아 최대 3장이다.
 * 세션 지배자는 세션 리포트 topRiser를 그대로 쓴다(dominatorId, 후보 입력에 없으면 건너뜀).
 */
export const pickSessionPraiseCandidates = ({
  players,
  dominatorId,
}: {
  players: readonly SessionPraisePlayerInput[];
  dominatorId: string | null;
}): PickedSessionPraiseCandidate[] => {
  const picked: PickedSessionPraiseCandidate[] = [];
  const pickedIds = new Set<string>();
  for (const category of SESSION_PRAISE_CATEGORIES) {
    if (picked.length >= SESSION_PRAISE_MAX_CANDIDATES) break;
    if (category === "dominator") {
      const dominator = players.find((input) => input.playerId === dominatorId);
      if (dominator) {
        picked.push({
          playerId: dominator.playerId,
          category,
          value: dominator.ratingDelta,
        });
        pickedIds.add(dominator.playerId);
      }
      continue;
    }
    const rule = CATEGORY_RULES[category];
    const winner = players
      .filter((input) => !pickedIds.has(input.playerId) && rule.isEligible(input))
      .sort(rule.compare)[0];
    if (winner) {
      picked.push({
        playerId: winner.playerId,
        category,
        value: rule.value(winner),
      });
      pickedIds.add(winner.playerId);
    }
  }
  return picked;
};

/** 칭찬 마감 시각: 세션 끝 시각(getSessionEndsAt) + 24시간 */
export const getSessionPraiseClosesAt = (sessionEndsAt: Date) =>
  new Date(sessionEndsAt.getTime() + SESSION_PRAISE_WINDOW_MS);

/** 칭찬 상태: 세션이 끝나기 전 / 칭찬 받는 중 / 마감 */
export type SessionPraiseStatus = "upcoming" | "open" | "closed";

export const getSessionPraiseStatus = (
  sessionEndsAt: Date,
  now: Date,
): SessionPraiseStatus => {
  if (now.getTime() < sessionEndsAt.getTime()) return "upcoming";
  return now.getTime() < getSessionPraiseClosesAt(sessionEndsAt).getTime()
    ? "open"
    : "closed";
};

/** 칭찬하는 세션인지: SESSION_PRAISE_START 뒤에 끝난 세션 */
export const isSessionPraiseEnabled = (sessionEndsAt: Date) =>
  sessionEndsAt.getTime() > SESSION_PRAISE_START.getTime();

export interface SessionPraiseCandidate {
  player: RankingPlayer;
  category: SessionPraiseCategory;
  value: number;
  /** 지금까지 받은 칭찬 수(실시간) */
  praiseCount: number;
}

/** GET·POST /api/match-sessions/:sessionId/praise 응답 */
export interface SessionPraiseResponse {
  session: { id: string; name: string; kind: MatchSessionKind };
  status: SessionPraiseStatus;
  /** 우선순위 순 후보. 세션이 끝나기 전이거나 칭찬하지 않는 세션이면 빈 배열 */
  candidates: SessionPraiseCandidate[];
  /** 요청자가 칭찬한 회원. 아직 안 했으면 null */
  myTargetPlayerId: string | null;
}

/** POST /api/match-sessions/:sessionId/praise 요청 */
export interface SessionPraiseRequest {
  targetPlayerId: string;
}

/** GET /api/me/session-praises/pending 응답: 팝업으로 띄울 세션(끝난 시각 최신순) */
export interface PendingSessionPraisesResponse {
  items: SessionPraiseResponse[];
}

/** 칭찬 한 건(저장 형태) */
export interface SessionPraiseRecord {
  sessionId: string;
  voterPlayerId: string;
  targetPlayerId: string;
  createdAt: Date;
}

/**
 * 회원별 칭찬 SESSION_PRAISE_HIGHLIGHT_MIN개 이상 받은 세션과, 그 수에 닿은 시각(그 칭찬의 createdAt).
 * 칭찬 업적 입력에 쓴다.
 */
export const findPraiseReachedSessions = (
  praises: readonly SessionPraiseRecord[],
): Map<string, { sessionId: string; reachedAt: Date }[]> => {
  const byKey = new Map<string, SessionPraiseRecord[]>();
  for (const praise of praises) {
    const key = `${praise.sessionId}\u0000${praise.targetPlayerId}`;
    const list = byKey.get(key) ?? [];
    list.push(praise);
    byKey.set(key, list);
  }
  const result = new Map<string, { sessionId: string; reachedAt: Date }[]>();
  for (const list of byKey.values()) {
    if (list.length < SESSION_PRAISE_HIGHLIGHT_MIN) continue;
    list.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const { sessionId, targetPlayerId } = list[0];
    const reached = result.get(targetPlayerId) ?? [];
    reached.push({
      sessionId,
      reachedAt: list[SESSION_PRAISE_HIGHLIGHT_MIN - 1].createdAt,
    });
    result.set(targetPlayerId, reached);
  }
  return result;
};
