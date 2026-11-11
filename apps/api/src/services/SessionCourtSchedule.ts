import {
  MATCH_SCHEDULE_DURATION_MS,
  type MatchStatus,
} from "@pkpkdupr/shared/match";

export type CourtScheduleMatch = {
  id?: string;
  name?: string;
  status?: MatchStatus;
  matchStartsAt: Date;
  courtName?: string;
};

export type CourtScheduleSlot = {
  matchStartsAt: Date;
  courtName: string;
};

type CourtInterval = {
  label: string;
  courtName: string;
  startsAt: number;
  endsAt: number;
};

export const normalizeCourtName = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const getCourtKey = (courtName: string) => courtName.toLocaleLowerCase();

export const normalizeCourtNames = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("한 개 이상의 코트명을 입력해주세요.");
  }

  const courtKeys = new Set<string>();
  return value.map((item) => {
    const courtName = normalizeCourtName(item);
    if (!courtName) {
      throw new Error("코트명을 입력해주세요.");
    }

    const courtKey = getCourtKey(courtName);
    if (courtKeys.has(courtKey)) {
      throw new Error("같은 코트명을 중복 입력할 수 없습니다.");
    }
    courtKeys.add(courtKey);
    return courtName;
  });
};

const createCourtNameMap = (courts: string[]) =>
  new Map(courts.map((courtName) => [getCourtKey(courtName), courtName]));

const getMatchLabel = (match: CourtScheduleMatch, index: number) =>
  match.name?.trim() || match.id || `${index + 1}번 경기`;

const toInterval = (
  match: CourtScheduleMatch,
  index: number,
  courtNameByKey: Map<string, string>,
  requireCourtName: boolean,
): CourtInterval | null => {
  if (match.status === "cancelled") {
    return null;
  }

  const courtName = normalizeCourtName(match.courtName);
  const label = getMatchLabel(match, index);
  if (!courtName) {
    if (requireCourtName) {
      throw new Error(`${label}의 코트명을 먼저 지정해주세요.`);
    }
    return null;
  }

  const canonicalCourtName = courtNameByKey.get(getCourtKey(courtName));
  if (!canonicalCourtName) {
    throw new Error(`${label}의 코트명(${courtName})을 코트 목록에 포함해주세요.`);
  }

  const startsAt = new Date(match.matchStartsAt).getTime();
  if (Number.isNaN(startsAt)) {
    throw new Error(`${label}의 경기 예정 일시가 올바르지 않습니다.`);
  }

  return {
    label,
    courtName: canonicalCourtName,
    startsAt,
    endsAt: startsAt + MATCH_SCHEDULE_DURATION_MS,
  };
};

const getExistingIntervals = (
  courts: string[],
  existingMatches: CourtScheduleMatch[],
) => {
  const courtNameByKey = createCourtNameMap(courts);
  return existingMatches.flatMap((match, index) => {
    const interval = toInterval(match, index, courtNameByKey, true);
    return interval ? [interval] : [];
  });
};

const findEarliestStart = (
  intervals: CourtInterval[],
  from: number,
) => {
  let candidate = from;
  for (const interval of [...intervals].sort(
    (left, right) => left.startsAt - right.startsAt,
  )) {
    if (interval.endsAt <= candidate) {
      continue;
    }
    if (candidate + MATCH_SCHEDULE_DURATION_MS <= interval.startsAt) {
      break;
    }
    candidate = interval.endsAt;
  }
  return candidate;
};

export const buildCourtSchedule = ({
  courts,
  sessionStartsAt,
  existingMatches,
  matchCount,
}: {
  courts: string[];
  sessionStartsAt: Date;
  existingMatches: CourtScheduleMatch[];
  /** 새로 배정할 경기 수 */
  matchCount: number;
}): CourtScheduleSlot[] => {
  const normalizedCourts = normalizeCourtNames(courts);
  const sessionStartMs = new Date(sessionStartsAt).getTime();
  if (Number.isNaN(sessionStartMs)) {
    throw new Error("유효한 세션 날짜가 필요합니다.");
  }

  const intervals = getExistingIntervals(normalizedCourts, existingMatches);
  const slots: CourtScheduleSlot[] = [];

  for (let created = 0; created < matchCount; created += 1) {
    const candidates = normalizedCourts.map((courtName, courtIndex) => ({
      courtName,
      courtIndex,
      startsAt: findEarliestStart(
        intervals.filter((interval) => interval.courtName === courtName),
        sessionStartMs,
      ),
    }));
    candidates.sort(
      (left, right) =>
        left.startsAt - right.startsAt || left.courtIndex - right.courtIndex,
    );
    const selected = candidates[0];
    if (!selected) {
      throw new Error("배정할 코트가 없습니다.");
    }

    intervals.push({
      label: `${slots.length + 1}번 경기`,
      courtName: selected.courtName,
      startsAt: selected.startsAt,
      endsAt: selected.startsAt + MATCH_SCHEDULE_DURATION_MS,
    });
    slots.push({
      courtName: selected.courtName,
      matchStartsAt: new Date(selected.startsAt),
    });
  }

  return slots;
};

export const findCourtScheduleConflicts = ({
  courts,
  existingMatches,
  scheduledMatches,
}: {
  courts: string[];
  existingMatches: CourtScheduleMatch[];
  scheduledMatches: CourtScheduleMatch[];
}): string[] => {
  const normalizedCourts = normalizeCourtNames(courts);
  const courtNameByKey = createCourtNameMap(normalizedCourts);
  const intervals = [
    ...existingMatches.flatMap((match, index) => {
      const interval = toInterval(match, index, courtNameByKey, true);
      return interval ? [interval] : [];
    }),
    ...scheduledMatches.flatMap((match, index) => {
      const interval = toInterval(match, index, courtNameByKey, true);
      return interval ? [interval] : [];
    }),
  ];

  const conflicts: string[] = [];
  for (const courtName of normalizedCourts) {
    const courtIntervals = intervals
      .filter((interval) => interval.courtName === courtName)
      .sort((left, right) => left.startsAt - right.startsAt);
    for (let index = 1; index < courtIntervals.length; index += 1) {
      const previous = courtIntervals[index - 1];
      const current = courtIntervals[index];
      if (previous && current && current.startsAt < previous.endsAt) {
        conflicts.push(
          `${courtName}: ${previous.label}와 ${current.label}의 시간이 겹칩니다.`,
        );
      }
    }
  }

  return conflicts;
};
