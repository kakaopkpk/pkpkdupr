import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  buildScheduleDayMarks,
  getScheduleDayEntries,
  type ScheduleMonthInfo,
  type ScheduleSessionInfo,
} from "@/lib/schedule";
import type { RecordMatchItemInfo, RecordSessionItemInfo } from "@/lib/records";
import type { MatchInfo } from "@/types/match";

const ME = "Pme00001";
const OTHER = "Pother01";

const member = (id: string) =>
  ({ id, username: id }) as ScheduleSessionInfo["participants"][number];

const makeSession = (
  overrides: Partial<ScheduleSessionInfo> & Pick<ScheduleSessionInfo, "id" | "dateKey">,
): ScheduleSessionInfo => ({
  name: "정기운동",
  kind: "regular",
  date: `${overrides.dateKey}T09:00:00.000Z`,
  location: "야탑초등학교",
  startTime: "18:00",
  endTime: "22:00",
  isToday: false,
  participants: [],
  matchCount: 0,
  isEnded: false,
  ...overrides,
});

const makeMatchItem = (
  id: string,
  matchStartsAt: string,
  playerIds: string[],
): RecordMatchItemInfo => ({
  kind: "match",
  match: {
    id,
    matchStartsAt,
    teams: [
      { players: playerIds.slice(0, 1).map((playerId) => ({ id: playerId })) },
      { players: playerIds.slice(1).map((playerId) => ({ id: playerId })) },
    ],
  } as unknown as MatchInfo,
});

const makeSessionItem = (
  session: ScheduleSessionInfo,
): RecordSessionItemInfo => ({
  kind: "session",
  session: {
    id: session.id,
    name: session.name,
    kind: session.kind,
    date: session.date,
    location: session.location,
    startTime: session.startTime,
    participantCount: session.participants.length,
    matchCount: 1,
  } as RecordSessionItemInfo["session"],
  mine: null,
});

describe("buildScheduleDayMarks", () => {
  it("세션 날은 참여 인원(중복 제외)·내 참여, 기록만 있는 날은 내 경기 여부", () => {
    const data: Pick<ScheduleMonthInfo, "sessions" | "records"> = {
      sessions: [
        makeSession({ id: "S1", dateKey: "2026-11-19", participants: [member(ME), member(OTHER)] }),
        makeSession({ id: "S2", dateKey: "2026-11-19", kind: "custom", participants: [member(OTHER)] }),
        makeSession({ id: "S3", dateKey: "2026-11-23", participants: [member(OTHER)] }),
      ],
      records: [
        // 11-14 16:05 KST, 내 경기
        makeMatchItem("M1", "2026-11-14T07:05:00.000Z", [OTHER, ME]),
        makeMatchItem("M2", "2026-11-14T06:42:00.000Z", [OTHER, OTHER]),
        // 11-07 남의 경기
        makeMatchItem("M3", "2026-11-07T06:42:00.000Z", [OTHER, OTHER]),
        // 세션 있는 날의 세션 없는 경기는 세션 표시를 바꾸지 않는다
        makeMatchItem("M4", "2026-11-23T06:00:00.000Z", [ME, OTHER]),
      ],
    };

    const marks = buildScheduleDayMarks(data, ME);

    expect(marks.get("2026-11-19")).toEqual({
      kind: "session",
      participantCount: 2,
      isMine: true,
      isTournament: false,
    });
    expect(marks.get("2026-11-23")).toEqual({
      kind: "session",
      participantCount: 1,
      isMine: false,
      isTournament: false,
    });
    expect(marks.get("2026-11-14")).toEqual({ kind: "match", isMine: true });
    expect(marks.get("2026-11-07")).toEqual({ kind: "match", isMine: false });
    expect(marks.has("2026-11-20")).toBe(false);
  });

  it("대회 세션이 있는 날은 다른 세션과 같은 날이어도 대회 표시", () => {
    const data: Pick<ScheduleMonthInfo, "sessions" | "records"> = {
      sessions: [
        makeSession({ id: "T1", dateKey: "2026-11-21", kind: "tournament", participants: [member(OTHER)] }),
        makeSession({ id: "R1", dateKey: "2026-11-26", participants: [member(ME)] }),
        makeSession({ id: "T2", dateKey: "2026-11-26", kind: "tournament", participants: [member(OTHER)] }),
      ],
      records: [],
    };

    const marks = buildScheduleDayMarks(data, ME);

    expect(marks.get("2026-11-21")).toEqual({
      kind: "session",
      participantCount: 1,
      isMine: false,
      isTournament: true,
    });
    expect(marks.get("2026-11-26")).toEqual({
      kind: "session",
      participantCount: 2,
      isMine: true,
      isTournament: true,
    });
  });
});

describe("getScheduleDayEntries", () => {
  const live = makeSession({ id: "Slive001", dateKey: "2026-11-19" });
  const upcoming = makeSession({ id: "Supcom01", dateKey: "2026-11-19", kind: "custom" });
  const ended = makeSession({ id: "Sended01", dateKey: "2026-11-16", isEnded: true });
  const endedEmpty = makeSession({ id: "Sempty01", dateKey: "2026-11-16", isEnded: true });
  const data: Pick<ScheduleMonthInfo, "sessions" | "records"> = {
    sessions: [ended, endedEmpty, live, upcoming],
    records: [
      makeMatchItem("Mlate001", "2026-11-16T12:00:00.000Z", [ME, OTHER]),
      makeSessionItem(ended),
      makeMatchItem("Mearly01", "2026-11-16T01:00:00.000Z", [ME, OTHER]),
    ],
  };

  it("끝나지 않은 세션은 진행 중이면 live, 아니면 upcoming", () => {
    expect(
      getScheduleDayEntries(data, "2026-11-19", live.id).map((entry) => entry.kind),
    ).toEqual(["live", "upcoming"]);
  });

  it("끝난 세션은 기록 줄이 있을 때만 세션 카드이고, 세션 없는 경기는 그 뒤에 최신순", () => {
    const entries = getScheduleDayEntries(data, "2026-11-16", null);
    expect(
      entries.map((entry) =>
        entry.kind === "record-match"
          ? entry.item.match.id
          : entry.kind === "record-session"
            ? entry.item.session.id
            : entry.session.id,
      ),
    ).toEqual([ended.id, "Mlate001", "Mearly01"]);
  });

  it("참여자가 아니어도 경기를 뛴 지난 세션 날은 내 세션이다", () => {
    const marks = buildScheduleDayMarks(
      {
        sessions: [ended],
        records: [{ ...makeSessionItem(ended), mine: {} as RecordSessionItemInfo["mine"] }],
      },
      ME,
    );
    expect(marks.get("2026-11-16")).toEqual({ kind: "session", participantCount: 0, isMine: true });
  });

  it("아무것도 없는 날은 빈 목록", () => {
    expect(getScheduleDayEntries(data, "2026-11-20", null)).toEqual([]);
  });
});
