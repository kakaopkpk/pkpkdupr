import {
  CHALLENGE_MIN_RATING_GAP,
  compareCountedMatches,
  getRatingGapBefore,
  RATING_EPSILON,
  sumPoints,
  WIN_STREAK_MIN,
} from "./achievements.js";
import { getWinningTeamIndex, type MatchScore } from "./match.js";
import type { RankingPlayer } from "./ranking.js";
import type { MatchSessionKind } from "./session.js";
import type { SpecialMatchOutcome } from "./specialMatch.js";

/**
 * 칭찬 후보 분류. 후보는 점수 순으로 고르고, 배열 순서는 점수가 같을 때의 순서다(드문 분류 먼저)
 */
export const SESSION_PRAISE_CATEGORIES = [
  "revenge",
  "underdog",
  "clutch",
  "streakGuard",
  "rankJump",
  "dominator",
  "mostWins",
  "mostPoints",
] as const;

export type SessionPraiseCategory = (typeof SESSION_PRAISE_CATEGORIES)[number];

export const SESSION_PRAISE_CATEGORY_LABEL: Record<SessionPraiseCategory, string> = {
  revenge: "복수자",
  underdog: "도전자",
  clutch: "승부사",
  streakGuard: "연승 수문장",
  rankJump: "순위 도약",
  dominator: "세션 지배자",
  mostWins: "최다 승리",
  mostPoints: "최다 득점",
};

/** 한 세션의 칭찬 후보 수 상한 */
export const SESSION_PRAISE_MAX_CANDIDATES = 3;
/** 순위 도약 후보가 되는 최소 상승 계단 수 */
export const SESSION_PRAISE_RANK_JUMP_MIN = 3;
/** 최다 승리 후보가 되는 최소 승 수 */
export const SESSION_PRAISE_MOST_WINS_MIN = 3;
/** 최다 득점 후보가 되는 최소 득점 */
export const SESSION_PRAISE_MOST_POINTS_MIN = 40;
/** 승부사의 듀스 승: 이긴 게임에서 이긴 팀 점수가 이 점수 이상 */
export const SESSION_PRAISE_CLUTCH_MIN_POINTS = 12;
/** 세션 지배자 점수: 평점 상승 이만큼당 1점 */
export const SESSION_PRAISE_DOMINATOR_POINT_UNIT = 0.012;
/** 이 수 이상 칭찬받으면 세션 상세·소식에서 강조하고 칭찬 업적에 센다 */
export const SESSION_PRAISE_HIGHLIGHT_MIN = 5;
/** 칭찬 마감: 세션 끝 시각부터 1시간 */
export const SESSION_PRAISE_WINDOW_MS = 60 * 60 * 1000;
/** 이 시각 뒤에 끝난 세션부터 칭찬한다(기능 배포일 00:00 KST). 그 전 세션에는 칭찬 섹션이 없다 */
export const SESSION_PRAISE_START = new Date("2026-11-23T15:00:00.000Z");

/** 칭찬 후보 계산에 쓰는 완료 경기(게스트가 낀 평점 미반영 경기 포함) */
export interface SessionPraiseMatch {
  id: string;
  completedAt: Date;
  teamPlayerIds: readonly [readonly string[], readonly string[]];
  scores: readonly MatchScore[];
  /** 게스트가 낀 평점 미반영 경기. 도전자에서만 뺀다 */
  ratingExcluded?: boolean;
  /** 특수 매치 결과. revenge_success면 이긴 팀이 복수자 횟수를 센다 */
  specialMatchOutcome?: SpecialMatchOutcome | null;
}

/** 세션 안 선수별 기록 */
export interface SessionPraisePlayerStats {
  matchCount: number;
  wins: number;
  /** 세션 경기에서 경기 직전 누적 연승이 WIN_STREAK_MIN 이상인 상대를 이긴 경기 수(경기마다 한 번) */
  streakBreaks: number;
  /** 끊은 연승 중 가장 긴 것(경기마다 상대 중 큰 쪽). 끊은 적 없으면 0 */
  bestBrokenStreak: number;
  /** 이긴 게임에서 이긴 팀 점수가 SESSION_PRAISE_CLUTCH_MIN_POINTS 이상인 승리 경기 수 */
  clutchWins: number;
  /** 평점 반영 승리 경기의 경기 직전 평점 차(상대 팀 평균 − 우리 팀 평균, 0.01 단위 내림) 최댓값. 없으면 0 */
  underdogGap: number;
  /** 리벤지 성공 경기에서 이긴 수 */
  revenges: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** 이긴 팀 기준 경기 직전 평점 차(0.01 단위 내림). 평점 미반영 경기·평점 입력이 없는 경기는 0 */
const getUnderdogGap = (
  match: SessionPraiseMatch,
  winner: 0 | 1,
  ratingBefore: Readonly<Record<string, number | null>> | undefined,
) => {
  if (!ratingBefore || match.ratingExcluded) return 0;
  const teams = match.teamPlayerIds;
  const gap = getRatingGapBefore(ratingBefore, teams[winner], teams[winner === 0 ? 1 : 0]);
  // 빈 팀이면 NaN이라 0이 된다
  return gap > 0 ? Math.floor(gap * 100 + RATING_EPSILON * 100) / 100 : 0;
};

/** 이긴 팀 점수가 SESSION_PRAISE_CLUTCH_MIN_POINTS 이상인 게임을 이 팀이 이겼다 */
const isClutchWin = (scores: readonly MatchScore[], teamIndex: 0 | 1) =>
  scores.some((score) => {
    const mine = teamIndex === 0 ? score.scoreA : score.scoreB;
    const theirs = teamIndex === 0 ? score.scoreB : score.scoreA;
    return mine > theirs && mine >= SESSION_PRAISE_CLUTCH_MIN_POINTS;
  });

/**
 * 세션 완료 경기로 선수별 세션 기록을 센다(완료 시각 순).
 * 연승은 누적 연승이라 allMatches(세션 밖 경기 포함 전체 완료 경기)를 처음부터 훑어 잇고,
 * 기록은 세션 경기에서만 쌓는다. 승패가 갈리지 않은 경기는 연승을 끊는다.
 * ratingBeforeByMatchId는 경기 id별 경기 직전 선수별 평점(그 경기 분류, 평점 변경 로그의 previousRating)이고
 * 도전자에만 쓴다. 없는 경기는 도전자를 세지 않고, 값이 없는 선수는 DUPR_DEFAULT_RATING(3.0)으로 친다
 */
export const buildSessionPraisePlayerStats = (
  sessionMatches: readonly SessionPraiseMatch[],
  allMatches: readonly SessionPraiseMatch[] = sessionMatches,
  ratingBeforeByMatchId: ReadonlyMap<
    string,
    Readonly<Record<string, number | null>>
  > = new Map(),
): Map<string, SessionPraisePlayerStats> => {
  const statsByPlayerId = new Map<string, SessionPraisePlayerStats>();
  const streakByPlayerId = new Map<string, number>();
  const getStats = (playerId: string) => {
    let stats = statsByPlayerId.get(playerId);
    if (!stats) {
      stats = {
        matchCount: 0,
        wins: 0,
        streakBreaks: 0,
        bestBrokenStreak: 0,
        clutchWins: 0,
        underdogGap: 0,
        revenges: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };
      statsByPlayerId.set(playerId, stats);
    }
    return stats;
  };

  const sessionMatchIds = new Set(sessionMatches.map((match) => match.id));
  // 마지막 세션 경기 뒤 경기는 세션 기록에 영향이 없어 훑지 않는다
  let remaining = sessionMatchIds.size;
  for (const match of [...allMatches].sort(compareCountedMatches)) {
    if (remaining === 0) break;
    const isSessionMatch = sessionMatchIds.has(match.id);
    if (isSessionMatch) remaining -= 1;
    const winner = getWinningTeamIndex(match);
    const teams = match.teamPlayerIds.map((team) => [...new Set(team)]) as [
      string[],
      string[],
    ];
    // 진 팀 중 경기 직전 연승이 가장 긴 사람의 연승(기준점 전이면 저지가 아니다)
    const brokenStreak =
      isSessionMatch && winner !== null
        ? Math.max(
            0,
            ...teams[winner === 0 ? 1 : 0].map(
              (playerId) => streakByPlayerId.get(playerId) ?? 0,
            ),
          )
        : 0;
    const underdogGap =
      isSessionMatch && winner !== null
        ? getUnderdogGap(match, winner, ratingBeforeByMatchId.get(match.id))
        : 0;
    teams.forEach((team, index) => {
      const teamIndex = index as 0 | 1;
      const won = winner === teamIndex;
      for (const playerId of team) {
        const streak = won ? (streakByPlayerId.get(playerId) ?? 0) + 1 : 0;
        streakByPlayerId.set(playerId, streak);
        if (!isSessionMatch) continue;
        const stats = getStats(playerId);
        stats.matchCount += 1;
        stats.pointsFor += sumPoints(match.scores, teamIndex);
        stats.pointsAgainst += sumPoints(
          match.scores,
          teamIndex === 0 ? 1 : 0,
        );
        if (!won) continue;
        stats.wins += 1;
        if (brokenStreak >= WIN_STREAK_MIN) {
          stats.streakBreaks += 1;
          stats.bestBrokenStreak = Math.max(stats.bestBrokenStreak, brokenStreak);
        }
        if (isClutchWin(match.scores, teamIndex)) stats.clutchWins += 1;
        stats.underdogGap = Math.max(stats.underdogGap, underdogGap);
        if (match.specialMatchOutcome === "revenge_success") stats.revenges += 1;
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
  /**
   * 분류의 값: 평점 상승폭·끊은 가장 긴 연승·오른 계단 수·승 수·득점·듀스 승 수·평점 차·리벤지 성공 수
   */
  value: number;
  /** 연승 수문장의 저지 횟수(다른 분류는 없음) */
  streakBreaks?: number;
  /** 고르는 데 쓴 점수 */
  score: number;
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

/** 득실차 → compareRest */
const compareByPointDiff = (
  left: SessionPraisePlayerInput,
  right: SessionPraisePlayerInput,
) => getPointDiff(right) - getPointDiff(left) || compareRest(left, right);

interface CategoryRule {
  /** 후보가 아니면 null. dominatorId는 세션 리포트 topRiser다 */
  pick: (
    input: SessionPraisePlayerInput,
    dominatorId: string | null,
  ) => { value: number; score: number; streakBreaks?: number } | null;
  /** 같은 분류·같은 점수 안의 순서. 앞에 올 사람이 음수 */
  compare: (
    left: SessionPraisePlayerInput,
    right: SessionPraisePlayerInput,
  ) => number;
}

/** 분류별 후보 조건·값·점수(docs/product.md "세션 칭찬") */
const CATEGORY_RULES: Record<SessionPraiseCategory, CategoryRule> = {
  revenge: {
    pick: ({ stats }) =>
      stats.revenges >= 1
        ? { value: stats.revenges, score: 5 + (stats.revenges - 1) * 8 }
        : null,
    compare: compareByPointDiff,
  },
  // 도전자: 업적 "도전자"·도전 매치와 같은 기준(CHALLENGE_MIN_RATING_GAP) 이상 높은 팀을 이긴 회원
  underdog: {
    pick: ({ stats }) =>
      stats.underdogGap >= CHALLENGE_MIN_RATING_GAP - RATING_EPSILON
        ? {
            value: stats.underdogGap,
            score: 3 + (stats.underdogGap - CHALLENGE_MIN_RATING_GAP) * 100,
          }
        : null,
    compare: compareByPointDiff,
  },
  clutch: {
    pick: ({ stats }) =>
      stats.clutchWins >= 1
        ? { value: stats.clutchWins, score: 3 + (stats.clutchWins - 1) * 6 }
        : null,
    compare: compareByPointDiff,
  },
  streakGuard: {
    pick: ({ stats }) => {
      if (stats.streakBreaks < 1) return null;
      return {
        value: stats.bestBrokenStreak,
        streakBreaks: stats.streakBreaks,
        score:
          stats.streakBreaks === 1
            ? 6 + (stats.bestBrokenStreak - WIN_STREAK_MIN) * 2
            : 6 + (stats.streakBreaks - 1) * 10,
      };
    },
    compare: compareByPointDiff,
  },
  rankJump: {
    pick: (input) => {
      const jump = getRankJump(input);
      return jump >= SESSION_PRAISE_RANK_JUMP_MIN
        ? { value: jump, score: 6 + (jump - SESSION_PRAISE_RANK_JUMP_MIN) * 2 }
        : null;
    },
    compare: (left, right) =>
      (left.rankAfter ?? Infinity) - (right.rankAfter ?? Infinity) ||
      compareText(left.username, right.username) ||
      compareText(left.playerId, right.playerId),
  },
  dominator: {
    pick: (input, dominatorId) =>
      input.playerId === dominatorId && input.ratingDelta > 0
        ? {
            value: input.ratingDelta,
            score: input.ratingDelta / SESSION_PRAISE_DOMINATOR_POINT_UNIT,
          }
        : null,
    compare: compareRest,
  },
  mostWins: {
    pick: ({ stats }) =>
      stats.wins >= SESSION_PRAISE_MOST_WINS_MIN
        ? {
            value: stats.wins,
            score: 5 + (stats.wins - SESSION_PRAISE_MOST_WINS_MIN) * 2,
          }
        : null,
    compare: (left, right) =>
      getWinRate(right) - getWinRate(left) || compareByPointDiff(left, right),
  },
  mostPoints: {
    pick: ({ stats }) =>
      stats.pointsFor >= SESSION_PRAISE_MOST_POINTS_MIN
        ? {
            value: stats.pointsFor,
            score:
              5 +
              Math.floor((stats.pointsFor - SESSION_PRAISE_MOST_POINTS_MIN) / 5),
          }
        : null,
    compare: compareByPointDiff,
  },
};

const CATEGORY_ORDER = new Map<SessionPraiseCategory, number>(
  SESSION_PRAISE_CATEGORIES.map((category, index) => [category, index]),
);

/**
 * 칭찬 후보를 고른다. 후보 조건을 넘은 (회원, 분류)를 점수 높은 순으로 줄 세워 앞에서부터 뽑는다.
 * 한 회원은 한 장, 한 분류도 한 회원만이고 최대 3장이며, 결과도 점수 순이다.
 * 점수가 같으면 SESSION_PRAISE_CATEGORIES 순서, 같은 분류 안에서는 분류별 동점 규칙이다.
 * 세션 지배자는 세션 리포트 topRiser를 그대로 쓴다(dominatorId, 후보 입력에 없으면 없음).
 */
export const pickSessionPraiseCandidates = ({
  players,
  dominatorId,
}: {
  players: readonly SessionPraisePlayerInput[];
  dominatorId: string | null;
}): PickedSessionPraiseCandidate[] => {
  const entries: (PickedSessionPraiseCandidate & {
    input: SessionPraisePlayerInput;
  })[] = [];
  for (const input of players) {
    for (const category of SESSION_PRAISE_CATEGORIES) {
      const result = CATEGORY_RULES[category].pick(input, dominatorId);
      if (result) {
        entries.push({ input, playerId: input.playerId, category, ...result });
      }
    }
  }
  entries.sort((left, right) => {
    if (Math.abs(right.score - left.score) > RATING_EPSILON) {
      return right.score - left.score;
    }
    if (left.category !== right.category) {
      return CATEGORY_ORDER.get(left.category)! - CATEGORY_ORDER.get(right.category)!;
    }
    return CATEGORY_RULES[left.category].compare(left.input, right.input);
  });

  const picked: PickedSessionPraiseCandidate[] = [];
  const pickedIds = new Set<string>();
  const pickedCategories = new Set<SessionPraiseCategory>();
  for (const { input, ...entry } of entries) {
    if (picked.length >= SESSION_PRAISE_MAX_CANDIDATES) break;
    if (pickedIds.has(input.playerId) || pickedCategories.has(entry.category)) {
      continue;
    }
    picked.push(entry);
    pickedIds.add(entry.playerId);
    pickedCategories.add(entry.category);
  }
  return picked;
};

/** 칭찬 마감 시각: 세션 끝 시각(getSessionEndsAt) + 1시간 */
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
  /** 연승 수문장의 저지 횟수. 1번이면 value(끊은 연승)로, 2번 이상이면 이 횟수로 표기한다. 다른 분류는 없음 */
  streakBreaks?: number;
  /** 지금까지 받은 칭찬 수(실시간) */
  praiseCount: number;
}

/** GET·POST /api/match-sessions/:sessionId/praise 응답 */
export interface SessionPraiseResponse {
  session: { id: string; name: string; kind: MatchSessionKind };
  status: SessionPraiseStatus;
  /** 점수 순 후보. 세션이 끝나기 전이거나 칭찬하지 않는 세션이면 빈 배열 */
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
