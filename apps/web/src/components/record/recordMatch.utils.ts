import type { MatchScore } from "@pkpkdupr/shared/match";

/** 자리 [A, B, C, D]. A·B가 왼쪽 팀, C·D가 오른쪽 팀이다. 값은 선수 id */
export type RecordSlots = [
  string | null,
  string | null,
  string | null,
  string | null,
];

export const EMPTY_SLOTS: RecordSlots = [null, null, null, null];

/** A → C → B → D. 2명이면 A vs C 단식, 4명이면 복식이 된다 */
const SLOT_FILL_ORDER = [0, 2, 1, 3] as const;

export const slotsFromTeams = (
  teams: readonly [readonly string[], readonly string[]],
): RecordSlots =>
  normalizeSlots([
    teams[0][0] ?? null,
    teams[0][1] ?? null,
    teams[1][0] ?? null,
    teams[1][1] ?? null,
  ]);

export const getSlotPlayerIds = (slots: RecordSlots) =>
  slots.filter((id): id is string => id !== null);

/**
 * 두 명이 한쪽 팀에만 남으면 뒷자리 선수를 반대편 첫 자리로 옮겨 단식 모양을 유지한다.
 * 예: A·C·B를 고른 뒤 C를 빼면 B가 C 자리로 간다.
 */
const normalizeSlots = (slots: RecordSlots): RecordSlots => {
  if (getSlotPlayerIds(slots).length !== 2) return slots;

  const [a, b, c, d] = slots;
  if (a !== null && b !== null) return [a, null, b, null];
  if (c !== null && d !== null) return [d, null, c, null];
  if (a === null && b !== null) return normalizeLeadingSlot([b, null, c, d]);
  return normalizeLeadingSlot(slots);
};

/** 한 팀에 한 명씩이면 그 팀의 첫 자리에 둔다 */
const normalizeLeadingSlot = ([a, b, c, d]: RecordSlots): RecordSlots => [
  a ?? b,
  a === null ? null : b,
  c ?? d,
  c === null ? null : d,
];

export const addSlotPlayer = (
  slots: RecordSlots,
  playerId: string,
): RecordSlots => {
  if (slots.includes(playerId)) return slots;

  const index = SLOT_FILL_ORDER.find((slotIndex) => slots[slotIndex] === null);
  if (index === undefined) return slots;

  const next = [...slots] as RecordSlots;
  next[index] = playerId;
  return next;
};

export const removeSlotPlayer = (
  slots: RecordSlots,
  playerId: string,
): RecordSlots =>
  normalizeSlots(
    slots.map((id) => (id === playerId ? null : id)) as RecordSlots,
  );

/** 단식(1:1)이나 복식(2:2)이면 두 팀 id, 아니면 null */
export const getSlotTeams = (
  slots: RecordSlots,
): [string[], string[]] | null => {
  const teamA = [slots[0], slots[1]].filter(
    (id): id is string => id !== null,
  );
  const teamB = [slots[2], slots[3]].filter(
    (id): id is string => id !== null,
  );

  return teamA.length === teamB.length && teamA.length > 0
    ? [teamA, teamB]
    : null;
};

export interface ScoreDraft {
  scoreA: number | null;
  scoreB: number | null;
}

export const EMPTY_SCORE: ScoreDraft = { scoreA: null, scoreB: null };

export const isScoreTie = (score: ScoreDraft) =>
  score.scoreA !== null && score.scoreA === score.scoreB;

export const toDecidedScore = (score: ScoreDraft): MatchScore | null =>
  score.scoreA !== null && score.scoreB !== null && score.scoreA !== score.scoreB
    ? { scoreA: score.scoreA, scoreB: score.scoreB }
    : null;

export interface PickListPlayer {
  id: string;
  username: string;
  status: string;
  lastPlayedAt: string | null;
}

const getLastPlayedAtMs = (lastPlayedAt: string | null) => {
  const value = lastPlayedAt ? new Date(lastPlayedAt).getTime() : Number.NaN;
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
};

/**
 * 선수 고르기 목록. 활성 회원을 아이디 부분 일치로 거른 뒤
 * 세션 참여자(경기 중 아님) → 경기 중인 사람 → 나머지(최근 경기 순) 한 목록으로 세운다.
 */
export const buildPickList = <T extends PickListPlayer>(
  players: readonly T[],
  {
    query,
    participantIds,
    busyIds,
  }: {
    query: string;
    /** 진행 중 세션 참여자 id(세션 순서). 세션이 없으면 빈 배열 */
    participantIds: readonly string[];
    busyIds: ReadonlySet<string>;
  },
): T[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const participantOrder = new Map(
    participantIds.map((id, index) => [id, index]),
  );
  const getGroup = (player: T) => {
    if (busyIds.has(player.id)) return 1;
    return participantOrder.has(player.id) ? 0 : 2;
  };

  return players
    .filter(
      (player) =>
        player.status === "active" &&
        (!normalizedQuery ||
          player.username.toLocaleLowerCase().includes(normalizedQuery)),
    )
    .sort(
      (a, b) =>
        getGroup(a) - getGroup(b) ||
        (participantOrder.get(a.id) ?? Number.POSITIVE_INFINITY) -
          (participantOrder.get(b.id) ?? Number.POSITIVE_INFINITY) ||
        getLastPlayedAtMs(b.lastPlayedAt) - getLastPlayedAtMs(a.lastPlayedAt) ||
        a.username.localeCompare(b.username),
    );
};

/** fetch 자체가 실패한 경우(오프라인·연결 끊김). 서버 응답 오류와 구분한다 */
export const isNetworkError = (error: unknown) => error instanceof TypeError;

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
