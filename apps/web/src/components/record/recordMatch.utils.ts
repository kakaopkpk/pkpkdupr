import type { MatchScore } from "@pkpkdupr/shared/match";

/** 자리 [A, B, C, D]. A·B가 왼쪽 팀, C·D가 오른쪽 팀이다. 값은 플레이어 id */
export type RecordSlots = [
  string | null,
  string | null,
  string | null,
  string | null,
];

export const EMPTY_SLOTS: RecordSlots = [null, null, null, null];

export const slotsFromTeams = (
  teams: readonly [readonly string[], readonly string[]],
): RecordSlots => [
  teams[0][0] ?? null,
  teams[0][1] ?? null,
  teams[1][0] ?? null,
  teams[1][1] ?? null,
];

export const getSlotPlayerIds = (slots: RecordSlots) =>
  slots.filter((id): id is string => id !== null);

/**
 * 목록에서 고른 플레이어가 들어갈 자리. 사용자가 고른 빈자리(preferredIndex)가 있으면 그 자리,
 * 없으면 왼쪽부터 첫 빈자리다. 빈자리가 없으면 null
 */
export const getNextSlotIndex = (
  slots: RecordSlots,
  preferredIndex: number | null = null,
): number | null => {
  if (preferredIndex !== null && slots[preferredIndex] === null) {
    return preferredIndex;
  }
  const index = slots.indexOf(null);
  return index === -1 ? null : index;
};

export const addSlotPlayer = (
  slots: RecordSlots,
  playerId: string,
  preferredIndex: number | null = null,
): RecordSlots => {
  if (slots.includes(playerId)) return slots;

  const index = getNextSlotIndex(slots, preferredIndex);
  if (index === null) return slots;

  const next = [...slots] as RecordSlots;
  next[index] = playerId;
  return next;
};

/** 그 플레이어 자리만 비운다. 다른 플레이어는 움직이지 않는다 */
export const removeSlotPlayer = (
  slots: RecordSlots,
  playerId: string,
): RecordSlots =>
  slots.map((id) => (id === playerId ? null : id)) as RecordSlots;

/** 두 자리를 맞바꾼다. 한쪽이 빈자리면 그 자리로 옮기는 것과 같다 */
export const swapSlots = (
  slots: RecordSlots,
  fromIndex: number,
  toIndex: number,
): RecordSlots => {
  if (fromIndex === toIndex) return slots;

  const next = [...slots] as RecordSlots;
  next[fromIndex] = slots[toIndex];
  next[toIndex] = slots[fromIndex];
  return next;
};

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

/** 오름차순 비교. 양쪽이 같은 무한대여도 NaN 대신 0을 돌려준다 */
const compareNumbers = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 플레이어 선택 목록. 활성 회원을 아이디 부분 일치로 거른 뒤
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
        compareNumbers(getGroup(a), getGroup(b)) ||
        compareNumbers(
          participantOrder.get(a.id) ?? Number.POSITIVE_INFINITY,
          participantOrder.get(b.id) ?? Number.POSITIVE_INFINITY,
        ) ||
        compareNumbers(
          getLastPlayedAtMs(b.lastPlayedAt),
          getLastPlayedAtMs(a.lastPlayedAt),
        ) ||
        a.username.localeCompare(b.username),
    );
};

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
