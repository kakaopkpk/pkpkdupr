import type {
  MatchScore,
  MatchType,
  RecordMatchTeamRequest,
} from "@pkpkdupr/shared/match";

/** 어드민 입력에서만 거는 점수 상한(동호회 듀스 규칙). 서버·앱은 0 이상 아무 점수나 받는다 */
export const ADMIN_MAX_SCORE = 15;

/** 팀당 최대 선수 수(복식) */
export const MAX_TEAM_SIZE = 2;

export interface MatchLineupValue {
  /** 팀별 선수 id. 단식 1명, 복식 2명 */
  teams: [string[], string[]];
  /** 입력 중인 점수 문자열(빈 문자열 허용) */
  scores: [string, string];
}

const SCORE_PATTERN = /^\d+$/;

/** 0 이상 정수 문자열이면 그 수, 아니면 null */
export const parseLineupScore = (value: string): number | null => {
  const trimmed = value.trim();
  return SCORE_PATTERN.test(trimmed) ? Number(trimmed) : null;
};

/** 두 점수가 모두 정수이고 다르면 이긴 팀 index, 아니면 null */
export const getLineupWinnerIndex = (value: MatchLineupValue): 0 | 1 | null => {
  const scoreA = parseLineupScore(value.scores[0]);
  const scoreB = parseLineupScore(value.scores[1]);
  if (scoreA === null || scoreB === null || scoreA === scoreB) return null;
  return scoreA > scoreB ? 0 : 1;
};

/** 두 점수가 같은 수인지(앞자리 0·공백 무시). 숫자가 아니면 문자열로 비교한다 */
export const isSameLineupScores = (
  a: MatchLineupValue["scores"],
  b: MatchLineupValue["scores"],
): boolean =>
  a.every((score, index) => {
    const left = parseLineupScore(score);
    const right = parseLineupScore(b[index]);
    return left !== null && right !== null
      ? left === right
      : score.trim() === b[index].trim();
  });

/** 저장할 수 없으면 화면 문구, 저장할 수 있으면 null. original을 주면 원래 점수를 안 고친 경우 15점 상한을 건너뛴다 */
export const validateMatchLineup = (
  value: MatchLineupValue,
  original?: MatchLineupValue,
): string | null => {
  if (inferLineupMatchType(value) === null) {
    return "두 팀 선수를 1:1 또는 2:2로 맞춰 주세요.";
  }
  if (value.scores.some((score) => score.trim() === "")) {
    return "두 팀 점수를 모두 넣어 주세요.";
  }
  const scoreA = parseLineupScore(value.scores[0]);
  const scoreB = parseLineupScore(value.scores[1]);
  if (scoreA === null || scoreB === null) {
    return "점수는 0 이상 정수로 넣어 주세요.";
  }
  if (scoreA === scoreB) {
    return "동점은 저장할 수 없어요.";
  }
  const keepsOriginalScores =
    original !== undefined && isSameLineupScores(value.scores, original.scores);
  if (
    !keepsOriginalScores &&
    (scoreA > ADMIN_MAX_SCORE || scoreB > ADMIN_MAX_SCORE)
  ) {
    return `${ADMIN_MAX_SCORE}점을 넘는 점수는 저장할 수 없어요.`;
  }
  return null;
};

export const toRecordTeams = (
  value: MatchLineupValue,
): [RecordMatchTeamRequest, RecordMatchTeamRequest] => [
  { playerIds: [...value.teams[0]] },
  { playerIds: [...value.teams[1]] },
];

/** validateMatchLineup을 통과한 값에만 쓴다 */
export const toMatchScore = (value: MatchLineupValue): MatchScore => ({
  scoreA: Number(value.scores[0].trim()),
  scoreB: Number(value.scores[1].trim()),
});

/**
 * 팀 수로 정한 분류. 1:1이면 단식, 2:2면 복식(MatchType 값)이고 그 밖이면 null.
 * 성별을 보지 않으므로 팀 구성 검사가 인원수뿐인 "singles"·"unrestricted-doubles"를 돌려준다.
 */
export const inferLineupMatchType = (
  value: MatchLineupValue,
): MatchType | null => {
  const [teamA, teamB] = value.teams;
  if (teamA.length === 1 && teamB.length === 1) return "singles";
  if (teamA.length === 2 && teamB.length === 2) return "unrestricted-doubles";
  return null;
};
