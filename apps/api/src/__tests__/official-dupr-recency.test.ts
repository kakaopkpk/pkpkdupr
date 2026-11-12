import type { Match } from "@pkpkdupr/shared/match";
import type {
  OfficialDuprAdjustmentLog,
  Player,
  PlayerRatingChangeLog,
  StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  AuthService,
  getOfficialDuprRecencyWeight,
} from "../services/AuthService";
import type { RatingServiceContract } from "../services/RatingContract";
import { db } from "../db";

const NOW = new Date("2026-07-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const players = ["anchor", "partner", "opponent-a", "opponent-b", "admin"].map(
  (id): Player & { authUserId: string | null } => ({
    id,
    username: id,
    gender: "M",
    status: "active",
    duprRating: null,
    authUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
  }),
);

const playerById = new Map(players.map((player) => [player.id, player]));
let storedOfficialLogs: OfficialDuprAdjustmentLog[];
let storedPlayerById: Map<string, Record<string, unknown>>;
let persistedDuprStateByPlayerId: Map<string, StoredPlayerDupr>;
let replacedMatchCompletedLogs: PlayerRatingChangeLog[];

const buildMatch = (completedAt: Date): Match => ({
  id: `match-${completedAt.getTime()}`,
  type: "men-doubles",
  source: "player_created",
  creatorPlayerId: "anchor",
  status: "completed",
  teams: [
    {
      id: "team-a",
      name: "Team A",
      players: [playerById.get("anchor")!, playerById.get("partner")!],
    },
    {
      id: "team-b",
      name: "Team B",
      players: [
        playerById.get("opponent-a")!,
        playerById.get("opponent-b")!,
      ],
    },
  ],
  scores: [{ scoreA: 11, scoreB: 9 }],
  resultSubmittedByPlayerId: "anchor",
  resultSubmittedAt: completedAt,
  location: "Court",
  matchStartsAt: completedAt,
  completedAt,
  createdAt: completedAt,
  updatedAt: completedAt,
});

const writeSpies: MockInstance<(...args: any[]) => any>[] = [];

/** 미리보기는 저장소 쓰기 없이 조회만 해야 한다. */
const expectNoRepositoryWrites = () => {
  for (const spy of writeSpies) {
    expect(spy).not.toHaveBeenCalled();
  }
};

const clearRepositoryWrites = () => {
  for (const spy of writeSpies) {
    spy.mockClear();
  }
};

describe("official DUPR recency propagation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storedOfficialLogs = [];
    storedPlayerById = new Map(
      players.map((player) => [player.id, { ...player }]),
    );
    persistedDuprStateByPlayerId = new Map();
    replacedMatchCompletedLogs = [];

    vi.spyOn(db.ratingWriteLock, "run").mockImplementation((fn) => fn());
    vi.spyOn(db.players, "findAll").mockImplementation(
      async () => [...storedPlayerById.values()] as any,
    );
    vi.spyOn(db.players, "findById").mockImplementation(
      async (playerId) => storedPlayerById.get(playerId) as any,
    );
    vi.spyOn(db.officialDuprAdjustmentLogs, "findAll").mockImplementation(
      async () => [...storedOfficialLogs],
    );
    writeSpies.length = 0;
    writeSpies.push(
      vi
        .spyOn(db.officialDuprAdjustmentLogs, "create")
        .mockImplementation(async (log) => {
          storedOfficialLogs.push(log);
          return log;
        }),
      vi
        .spyOn(db.matches, "fillMissingParticipantDuprSnapshots")
        .mockResolvedValue({
          updatedParticipantCount: 0,
          updatedMatchCount: 0,
        }),
      vi
        .spyOn(db.playerRatingChangeLogs, "create")
        .mockImplementation(async (log) => log),
      vi
        .spyOn(db.playerRatingChangeLogs, "replaceMatchCompleted")
        .mockImplementation(async (logs) => {
          replacedMatchCompletedLogs = logs;
          return logs;
        }),
      vi
        .spyOn(db.players, "updateDuprState")
        .mockImplementation(async (playerId, duprState) => {
          const updated = {
            ...storedPlayerById.get(playerId),
            duprRating: duprState,
          };
          storedPlayerById.set(playerId, updated);
          persistedDuprStateByPlayerId.set(playerId, duprState);
          return updated as any;
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("30일마다 공식 DUPR 전파 가중치가 절반으로 감소한다", () => {
    expect(getOfficialDuprRecencyWeight(NOW, NOW)).toBe(1);
    expect(
      getOfficialDuprRecencyWeight(
        new Date(NOW.getTime() - 30 * DAY_MS),
        NOW,
      ),
    ).toBeCloseTo(0.5, 10);
    expect(
      getOfficialDuprRecencyWeight(
        new Date(NOW.getTime() - 60 * DAY_MS),
        NOW,
      ),
    ).toBeCloseTo(0.25, 10);
    expect(
      getOfficialDuprRecencyWeight(
        new Date(NOW.getTime() + DAY_MS),
        NOW,
      ),
    ).toBe(1);
  });

  it("최근 경기일수록 파트너와 상대 전원에게 더 크게 전파하고 입력 선수는 공식값으로 고정한다", async () => {
    const preview = async (daysAgo: number) =>
      new AuthService().previewOfficialDuprAdjustment(
        {
          playerId: "anchor",
          changedByPlayerId: "admin",
          ratings: { doubles: 4 },
          confidence: { doubles: 100 },
        },
        [buildMatch(new Date(NOW.getTime() - daysAgo * DAY_MS))],
      );

    const recent = await preview(0);
    const old = await preview(30);
    const getDoublesDelta = (
      result: Awaited<ReturnType<typeof preview>>,
      playerId: string,
    ) =>
      result.impacts.find((impact) => impact.playerId === playerId)?.delta
        .doubles ?? 0;

    for (const playerId of ["partner", "opponent-a", "opponent-b"]) {
      expect(Math.abs(getDoublesDelta(recent, playerId))).toBeGreaterThan(
        Math.abs(getDoublesDelta(old, playerId)),
      );
    }
    expect(
      recent.impacts.find((impact) => impact.playerId === "anchor")?.nextRating
        .doubles,
    ).toBe(4);
    expect(
      old.impacts.find((impact) => impact.playerId === "anchor")?.nextRating
        .doubles,
    ).toBe(4);

    expectNoRepositoryWrites();
  });

  it("공식 반영 이후 경기는 공식값에서 시작해 다시 레이팅을 변경한다", async () => {
    const preview = await new AuthService().previewOfficialDuprAdjustment(
      {
        playerId: "anchor",
        changedByPlayerId: "admin",
        ratings: { doubles: 4 },
        confidence: { doubles: 100 },
      },
      [buildMatch(new Date(NOW.getTime() + DAY_MS))],
    );

    expect(
      preview.impacts.find((impact) => impact.playerId === "anchor")?.nextRating
        .doubles,
    ).not.toBe(4);
  });

  it("한 경기에 anchor가 여러 명이면 가장 큰 시간 가중치를 참가자 전원에게 한 번만 적용한다", async () => {
    storedOfficialLogs = [
      {
        id: "partner-anchor",
        playerId: "partner",
        changedByPlayerId: "admin",
        changedByUsername: "admin",
        ratings: { doubles: 3.5 },
        confidence: { doubles: 80 },
        previousRating: { singles: 3, doubles: 3 },
        nextRating: { singles: 3, doubles: 3.5 },
        preUpdateAccuracy: { doubles: 0 },
        reason: null,
        createdAt: new Date(NOW.getTime() - 30 * DAY_MS),
      },
    ];
    const receivedWeights: Array<Record<string, number>> = [];
    const recordingRatingService: RatingServiceContract = {
      getAccuracy: () => 0,
      getCorrectionWeight: () => 1,
      replayMatch: (match, weights = {}) => {
        receivedWeights.push(weights);
        return Object.fromEntries(
          match.participants.map((participant) => [
            participant.playerId,
            participant.state,
          ]),
        );
      },
    };

    await new AuthService(
      recordingRatingService,
    ).previewOfficialDuprAdjustment(
      {
        playerId: "anchor",
        changedByPlayerId: "admin",
        ratings: { doubles: 4 },
        confidence: { doubles: 100 },
      },
      [buildMatch(new Date(NOW.getTime() - 60 * DAY_MS))],
    );

    expect(receivedWeights).toEqual([
      {
        anchor: 0.5,
        partner: 0.5,
        "opponent-a": 0.5,
        "opponent-b": 0.5,
      },
    ]);
  });

  it("미리보기와 확정 반영 결과가 같고 확정 시 공식 레이팅과 confidence를 그대로 저장한다", async () => {
    const service = new AuthService();
    const input = {
      playerId: "anchor",
      changedByPlayerId: "admin",
      ratings: { doubles: 4 },
      confidence: { doubles: 87 },
    };
    const completedMatches = [
      buildMatch(new Date(NOW.getTime() - 30 * DAY_MS)),
    ];

    const preview = await service.previewOfficialDuprAdjustment(
      input,
      completedMatches,
    );
    expectNoRepositoryWrites();

    clearRepositoryWrites();
    const applied = await service.applyOfficialDuprAdjustment(
      input,
      async () => completedMatches,
    );
    const appliedNextRatingByPlayerId = new Map(
      applied.ratingChangeLogs.map((log) => [log.playerId, log.nextRating]),
    );

    for (const impact of preview.impacts) {
      expect(appliedNextRatingByPlayerId.get(impact.playerId)).toEqual(
        impact.nextRating,
      );
    }
    expect(persistedDuprStateByPlayerId.get("anchor")).toMatchObject({
      rating: { doubles: 4 },
      metrics: {
        doubles: {
          confidence: 87,
          accuracy: 100,
        },
      },
    });
    expect(replacedMatchCompletedLogs).toHaveLength(4);
  });

  it("전체 재계산은 기존 경기별 로그를 누적하지 않고 한 번에 교체한다", async () => {
    const service = new AuthService();
    const completedMatches = [buildMatch(new Date(NOW.getTime() - DAY_MS))];

    const first = await service.recalculateDuprRatings(async () => completedMatches, {
      perMatchLogs: true,
    });
    const firstIds = first.perMatchLogs.map((log) => log.id);

    const second = await service.recalculateDuprRatings(async () => completedMatches, {
      perMatchLogs: true,
    });

    expect(first.perMatchLogs).toHaveLength(4);
    expect(second.perMatchLogs).toHaveLength(4);
    expect(replacedMatchCompletedLogs).toHaveLength(4);
    expect(replacedMatchCompletedLogs.map((log) => log.id)).not.toEqual(firstIds);
  });

  it("레이팅이 변하지 않은 참가자도 경기별 로그로 보존한다", async () => {
    const unchangedRatingService: RatingServiceContract = {
      getAccuracy: () => 0,
      getCorrectionWeight: () => 1,
      replayMatch: (match) =>
        Object.fromEntries(
          match.participants.map((participant) => [
            participant.playerId,
            participant.state,
          ]),
        ),
    };
    const service = new AuthService(unchangedRatingService);

    const recalculation = await service.recalculateDuprRatings(
      async () => [buildMatch(new Date(NOW.getTime() - DAY_MS))],
      { perMatchLogs: true },
    );

    expect(recalculation.perMatchLogs).toHaveLength(4);
    expect(replacedMatchCompletedLogs).toHaveLength(4);
    for (const log of recalculation.perMatchLogs) {
      expect(log.previousRating).toEqual(log.nextRating);
      expect(log.delta).toEqual({ singles: 0, doubles: 0 });
    }
  });
});
