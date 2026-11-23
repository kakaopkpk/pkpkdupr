import {
  MatchRepository,
  type CreateMatchInput,
  type UpdateRecordedMatchInput,
} from "@pkpkdupr/db";
import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { afterEach, describe, expect, it, vi } from "vitest";

// 경기 저장 메서드가 세션 참여자 추가를 경기 저장과 같은 트랜잭션에서 하는지 가짜 client로 확인한다

const NOW = new Date("2026-11-20T10:00:00.000Z");
const SESSION_ID = "Ssess001";
const SESSION_DATE_SECONDS = 1_795_000_000;

const player = (id: string): Player => ({
  isGuest: false,
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const teams: CreateMatchInput["teams"] = [
  { id: "team-a", name: "Team A", players: [player("player-a")] },
  { id: "team-b", name: "Team B", players: [player("player-b")] },
];

const session = {
  id: SESSION_ID,
  name: "목요 정기운동",
  date: new Date(SESSION_DATE_SECONDS * 1000),
  location: "야탑초등학교",
};

const createInput = (overrides: Partial<CreateMatchInput> = {}): CreateMatchInput => ({
  id: "Mmatch01",
  type: "singles",
  creatorPlayerId: "player-a",
  session,
  status: "completed",
  teams,
  scores: [{ scoreA: 11, scoreB: 7 }],
  location: "야탑초등학교",
  matchStartsAt: NOW,
  completedAt: NOW,
  resultSubmittedByPlayerId: "player-a",
  resultSubmittedAt: NOW,
  ...overrides,
});

type Statement = { sql: string; args: unknown[] };
type Result = { rows: Record<string, unknown>[]; rowsAffected: number };

/**
 * respond가 undefined를 돌려주면 기본 응답(쓰기 1행, 조회 0행)을 쓴다.
 * 풀(client.execute)로 실행한 문장은 poolStatements에 따로 모은다.
 */
const createRepository = (
  respond: (statement: Statement) => Result | undefined = () => undefined,
) => {
  const statements: Statement[] = [];
  const poolStatements: Statement[] = [];
  const transaction = {
    execute: vi.fn(async (statement: Statement) => {
      statements.push(statement);
      const custom = respond(statement);
      if (custom) return custom;
      if (/^\s*SELECT/.test(statement.sql)) {
        return { rows: [], rowsAffected: 0 };
      }
      return { rows: [], rowsAffected: 1 };
    }),
    commit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    db: {},
  };
  const client = {
    execute: vi.fn(async (statement: Statement) => {
      poolStatements.push(statement);
      return { rows: [], rowsAffected: 1 };
    }),
    transaction: vi.fn(async () => transaction),
  };
  const repository = new MatchRepository({}, client);
  vi.spyOn(repository, "findById").mockImplementation(
    async (id) => ({ id }) as Match,
  );
  const indexOf = (pattern: RegExp) =>
    statements.findIndex((statement) => pattern.test(statement.sql));
  return { repository, client, transaction, statements, poolStatements, indexOf };
};

const PARTICIPANT_INSERT = /INSERT INTO match_session_participants/;
const SESSION_TOUCH = /UPDATE match_sessions SET updated_at/;

describe("MatchRepository.updateRecordedMatch 세션 참여자", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const input: UpdateRecordedMatchInput = {
    type: "singles",
    location: "야탑초등학교",
    teams,
    scores: [{ scoreA: 11, scoreB: 7 }],
    resultSubmittedByPlayerId: "player-a",
    resultSubmittedAt: NOW,
    ratingExcluded: false,
    expectedUpdatedAt: new Date(SESSION_DATE_SECONDS * 1000),
  };

  it("낙관적 잠금으로 UPDATE가 0행이면 참여자를 넣지 않고 커밋하지 않는다", async () => {
    const { repository, client, transaction, indexOf, poolStatements } =
      createRepository((statement) => {
        if (/UPDATE matches/.test(statement.sql)) {
          return { rows: [], rowsAffected: 0 };
        }
        if (/SELECT status, updated_at/.test(statement.sql)) {
          return {
            rows: [{ status: "completed", updated_at: SESSION_DATE_SECONDS + 5 }],
            rowsAffected: 0,
          };
        }
        return undefined;
      });

    await expect(repository.updateRecordedMatch("Mmatch01", input)).rejects.toThrow();

    expect(indexOf(PARTICIPANT_INSERT)).toBe(-1);
    expect(poolStatements).toEqual([]);
    expect(client.execute).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalled();
  });

  it("저장 뒤 경기 세션이 있으면 같은 트랜잭션에서 팀 선수를 참여자로 넣는다", async () => {
    const { repository, client, transaction, statements, indexOf } =
      createRepository((statement) =>
        /UPDATE matches/.test(statement.sql)
          ? { rows: [{ session_id: SESSION_ID }], rowsAffected: 1 }
          : undefined,
      );

    const result = await repository.updateRecordedMatch("Mmatch01", input);

    const updateIndex = indexOf(/UPDATE matches/);
    const insertIndex = indexOf(PARTICIPANT_INSERT);
    expect(statements[updateIndex]!.sql).toMatch(/RETURNING session_id/);
    expect(insertIndex).toBeGreaterThan(updateIndex);
    expect(statements[insertIndex]!.args).toEqual([
      `${SESSION_ID}-player-a`,
      SESSION_ID,
      "player-a",
      NOW.getTime() / 1000,
      `${SESSION_ID}-player-b`,
      SESSION_ID,
      "player-b",
      NOW.getTime() / 1000,
    ]);
    expect(indexOf(SESSION_TOUCH)).toBeGreaterThan(insertIndex);
    expect(client.execute).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      match: { id: "Mmatch01" },
      sessionParticipantsAdded: true,
    });
  });

  it("이미 모두 참여자면 세션 updated_at을 올리지 않고 false를 돌려준다", async () => {
    const { repository, indexOf } = createRepository((statement) => {
      if (/UPDATE matches/.test(statement.sql)) {
        return { rows: [{ session_id: SESSION_ID }], rowsAffected: 1 };
      }
      if (PARTICIPANT_INSERT.test(statement.sql)) {
        return { rows: [], rowsAffected: 0 };
      }
      return undefined;
    });

    const result = await repository.updateRecordedMatch("Mmatch01", input);

    expect(indexOf(SESSION_TOUCH)).toBe(-1);
    expect(result.sessionParticipantsAdded).toBe(false);
  });

  it("저장 뒤 세션이 없으면 참여자를 넣지 않는다", async () => {
    const { repository, indexOf } = createRepository((statement) =>
      /UPDATE matches/.test(statement.sql)
        ? { rows: [{ session_id: null }], rowsAffected: 1 }
        : undefined,
    );

    const result = await repository.updateRecordedMatch("Mmatch01", input);

    expect(indexOf(PARTICIPANT_INSERT)).toBe(-1);
    expect(result.sessionParticipantsAdded).toBe(false);
  });
});

describe("MatchRepository.create 세션 참여자", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const existingSession = (statement: Statement) =>
    /SELECT id FROM match_sessions/.test(statement.sql)
      ? { rows: [{ id: SESSION_ID }], rowsAffected: 0 }
      : undefined;

  it("세션이 있으면 참여자 INSERT와 경기 INSERT를 한 트랜잭션에서 실행하고 커밋한다", async () => {
    const { repository, client, transaction, indexOf } =
      createRepository(existingSession);

    await repository.create(createInput());

    const insertIndex = indexOf(PARTICIPANT_INSERT);
    const matchIndex = indexOf(/INSERT INTO matches/);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(matchIndex).toBeGreaterThan(insertIndex);
    expect(indexOf(/INSERT INTO match_participants/)).toBeGreaterThan(matchIndex);
    expect(indexOf(/INSERT INTO match_scores/)).toBeGreaterThan(matchIndex);
    // 이미 있는 세션은 다시 만들지 않는다
    expect(indexOf(/INSERT INTO match_sessions/)).toBe(-1);
    expect(client.execute).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it("경기 INSERT가 실패하면(id 충돌 등) 커밋하지 않고 롤백한다", async () => {
    const { repository, transaction, indexOf } = createRepository((statement) => {
      if (/INSERT INTO matches/.test(statement.sql)) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      return existingSession(statement);
    });

    await expect(repository.create(createInput())).rejects.toThrow("duplicate key");

    expect(indexOf(PARTICIPANT_INSERT)).toBeGreaterThanOrEqual(0);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalled();
  });

  it("세션 행이 없으면 같은 트랜잭션에서 만든 뒤 참여자를 넣는다", async () => {
    const { repository, indexOf } = createRepository();

    await repository.create(createInput());

    const sessionIndex = indexOf(/INSERT INTO match_sessions/);
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(indexOf(PARTICIPANT_INSERT)).toBeGreaterThan(sessionIndex);
  });

  it("세션 없는 경기는 참여자를 넣지 않는다", async () => {
    const { repository, transaction, indexOf } = createRepository();

    await repository.create(createInput({ session: undefined }));

    expect(indexOf(PARTICIPANT_INSERT)).toBe(-1);
    expect(indexOf(/INSERT INTO matches/)).toBeGreaterThanOrEqual(0);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });
});

describe("MatchRepository.createCompletedBatch 세션 참여자", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("모든 경기의 팀 선수를 경기와 같은 트랜잭션에서 참여자로 넣는다", async () => {
    const { repository, client, transaction, statements, indexOf } =
      createRepository((statement) =>
        /SELECT id FROM match_sessions/.test(statement.sql)
          ? { rows: [{ id: SESSION_ID }], rowsAffected: 0 }
          : undefined,
      );

    await repository.createCompletedBatch([
      createInput({ id: "Mmatch01" }),
      createInput({
        id: "Mmatch02",
        teams: [
          { id: "team-a", name: "Team A", players: [player("player-a")] },
          { id: "team-b", name: "Team B", players: [player("player-c")] },
        ],
      }),
    ]);

    const insertIndex = indexOf(PARTICIPANT_INSERT);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(
      statements[insertIndex]!.args.filter((_, index) => index % 4 === 2),
    ).toEqual(["player-a", "player-b", "player-c"]);
    expect(client.execute).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });
});

describe("MatchRepository.updateMetadata 세션 참여자", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const respond = (statement: Statement) => {
    if (/FROM match_sessions/.test(statement.sql)) {
      return {
        rows: [{ id: SESSION_ID, name: "목요 정기운동", date: SESSION_DATE_SECONDS }],
        rowsAffected: 0,
      };
    }
    if (/SELECT player_id FROM match_participants/.test(statement.sql)) {
      return {
        rows: [{ player_id: "player-a" }, { player_id: "player-b" }],
        rowsAffected: 0,
      };
    }
    return undefined;
  };

  it("세션에 연결하면 경기 UPDATE와 같은 트랜잭션에서 선수를 참여자로 넣는다", async () => {
    const { repository, client, transaction, statements, indexOf } =
      createRepository(respond);

    const result = await repository.updateMetadata("Mmatch01", {
      sessionId: SESSION_ID,
    });

    const updateIndex = indexOf(/UPDATE matches/);
    const insertIndex = indexOf(PARTICIPANT_INSERT);
    expect(statements[updateIndex]!.sql).toMatch(/session_id = \$3/);
    expect(statements[updateIndex]!.args.slice(2)).toEqual([
      SESSION_ID,
      "목요 정기운동",
      SESSION_DATE_SECONDS,
    ]);
    expect(insertIndex).toBeGreaterThan(updateIndex);
    expect(client.execute).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      match: { id: "Mmatch01" },
      sessionParticipantsAdded: true,
    });
  });

  it("세션 연결을 풀면 참여자를 건드리지 않는다", async () => {
    const { repository, statements, indexOf } = createRepository(respond);

    const result = await repository.updateMetadata("Mmatch01", {
      sessionId: null,
    });

    expect(statements[indexOf(/UPDATE matches/)]!.sql).toMatch(
      /session_id = NULL/,
    );
    expect(indexOf(PARTICIPANT_INSERT)).toBe(-1);
    expect(result.sessionParticipantsAdded).toBe(false);
  });

  it("없는 경기면 참여자를 넣지 않고 match가 undefined다", async () => {
    const { repository, indexOf } = createRepository((statement) =>
      /UPDATE matches/.test(statement.sql)
        ? { rows: [], rowsAffected: 0 }
        : respond(statement),
    );

    const result = await repository.updateMetadata("Mmatch01", {
      sessionId: SESSION_ID,
    });

    expect(indexOf(PARTICIPANT_INSERT)).toBe(-1);
    expect(result).toEqual({ match: undefined, sessionParticipantsAdded: false });
  });

  it("없는 세션이면 UPDATE 없이 실패하고 커밋하지 않는다", async () => {
    const { repository, transaction, indexOf } = createRepository((statement) =>
      /FROM match_sessions/.test(statement.sql)
        ? { rows: [], rowsAffected: 0 }
        : respond(statement),
    );

    await expect(
      repository.updateMetadata("Mmatch01", { sessionId: SESSION_ID }),
    ).rejects.toThrow("세션을 찾을 수 없습니다.");

    expect(indexOf(/UPDATE matches/)).toBe(-1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalled();
  });
});
