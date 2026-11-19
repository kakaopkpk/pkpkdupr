import {
  MatchRepository,
  type UpdateRecordedMatchInput,
} from "@pkpkdupr/db";
import type { Match } from "@pkpkdupr/shared/match";
import type { Player } from "@pkpkdupr/shared/player";
import { afterEach, describe, expect, it, vi } from "vitest";

const SUBMITTED_AT = new Date("2026-07-23T10:00:00.000Z");
const SESSION_DATE_SECONDS = 1_784_000_000;

const player = (id: string): Player => ({
  isGuest: false,
  id,
  username: id,
  gender: "M",
  status: "active",
  duprRating: null,
  createdAt: SUBMITTED_AT,
  updatedAt: SUBMITTED_AT,
});

const baseInput: UpdateRecordedMatchInput = {
  type: "singles",
  location: "야탑초등학교",
  teams: [
    { id: "team-a", name: "Team A", players: [player("player-a")] },
    { id: "team-b", name: "Team B", players: [player("player-b")] },
  ],
  scores: [{ scoreA: 11, scoreB: 7 }],
  resultSubmittedByPlayerId: "player-admin",
  resultSubmittedAt: SUBMITTED_AT,
  ratingExcluded: false,
};

type Statement = { sql: string; args: unknown[] };

const createRepository = (sessionRows: Record<string, unknown>[] = []) => {
  const statements: Statement[] = [];
  const execute = vi.fn(async (statement: Statement) => {
    statements.push(statement);
    if (statement.sql.includes("FROM match_sessions")) {
      return { rows: sessionRows, rowsAffected: 0 };
    }
    if (statement.sql.includes("SELECT player_id")) {
      return { rows: [], rowsAffected: 0 };
    }
    return { rows: [], rowsAffected: 1 };
  });
  const transaction = {
    execute,
    commit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  const client = {
    execute: vi.fn(),
    transaction: vi.fn(async () => transaction),
  };
  const repository = new MatchRepository({}, client);
  vi.spyOn(repository, "findById").mockResolvedValue({ id: "Mfix1" } as Match);
  const updateStatement = () =>
    statements.find((statement) => statement.sql.includes("UPDATE matches"));
  return { repository, transaction, updateStatement };
};

/** UPDATE 문에서 `column = $N`으로 바인딩된 값을 꺼낸다 */
const assignedArg = (statement: Statement, column: string) => {
  const index = statement.sql.match(new RegExp(`\\b${column} = \\$(\\d+)`))?.[1];
  if (!index) {
    throw new Error(`${column} 할당이 없습니다.`);
  }
  return statement.args[Number(index) - 1];
};

describe("MatchRepository.updateRecordedMatch 관리자 정정", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("세션·시작 시각을 주지 않으면 그 컬럼은 바꾸지 않는다", async () => {
    const { repository, updateStatement } = createRepository();

    await repository.updateRecordedMatch("Mfix1", baseInput);

    const update = updateStatement()!;
    expect(update.sql).not.toMatch(/session_id =/);
    expect(update.sql).not.toMatch(/match_starts_at =/);
    expect(update.sql).toMatch(/completed_at = COALESCE\(completed_at, \$5\)/);
  });

  it("세션을 옮기면 세션 행의 이름·날짜를 같은 UPDATE로 복사한다", async () => {
    const { repository, updateStatement } = createRepository([
      { id: "Ssess002", name: "목요 정기운동", date: String(SESSION_DATE_SECONDS) },
    ]);

    await repository.updateRecordedMatch("Mfix1", {
      ...baseInput,
      sessionId: "Ssess002",
      expectedUpdatedAt: new Date(SESSION_DATE_SECONDS * 1000),
    });

    const update = updateStatement()!;
    expect(assignedArg(update, "session_id")).toBe("Ssess002");
    expect(assignedArg(update, "session_name")).toBe("목요 정기운동");
    expect(assignedArg(update, "session_date")).toBe(SESSION_DATE_SECONDS);
    // 낙관적 잠금 조건은 그대로 같은 UPDATE에 걸린다
    expect(update.sql).toMatch(/updated_at = \$7/);
    expect(update.args[6]).toBe(SESSION_DATE_SECONDS);
  });

  it("sessionId null이면 세션 컬럼을 비운다", async () => {
    const { repository, updateStatement } = createRepository();

    await repository.updateRecordedMatch("Mfix1", {
      ...baseInput,
      sessionId: null,
    });

    const update = updateStatement()!;
    expect(update.sql).toMatch(/session_id = NULL/);
    expect(update.sql).toMatch(/session_name = NULL/);
    expect(update.sql).toMatch(/session_date = NULL/);
  });

  it("없는 세션이면 UPDATE 없이 실패하고 트랜잭션을 닫는다", async () => {
    const { repository, transaction, updateStatement } = createRepository([]);

    await expect(
      repository.updateRecordedMatch("Mfix1", {
        ...baseInput,
        sessionId: "Smissing",
      }),
    ).rejects.toThrow("세션을 찾을 수 없어요.");

    expect(updateStatement()).toBeUndefined();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalled();
  });

  it("시작 시각을 바꾸면 완료 경기의 completed_at을 같은 만큼 옮긴다", async () => {
    const { repository, updateStatement } = createRepository();
    const matchStartsAt = new Date("2026-07-20T09:30:00.000Z");

    await repository.updateRecordedMatch("Mfix1", {
      ...baseInput,
      matchStartsAt,
    });

    const update = updateStatement()!;
    const startsAtSeconds = matchStartsAt.getTime() / 1000;
    expect(assignedArg(update, "match_starts_at")).toBe(startsAtSeconds);
    const param = update.sql.match(/match_starts_at = (\$\d+)/)![1]!;
    expect(update.sql).toContain(
      `THEN completed_at + (${param}::bigint - match_starts_at)`,
    );
    expect(update.sql).toMatch(/WHEN status = 'completed' AND completed_at IS NOT NULL/);
  });
});

describe("MatchRepository.updateRecordedMatch 수정 기록", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const snapshot = (overrides: Partial<Match> = {}): Match =>
    ({
      id: "Mfix1",
      type: "singles",
      location: "야탑초등학교",
      teams: baseInput.teams,
      scores: [{ scoreA: 11, scoreB: 7 }],
      matchStartsAt: SUBMITTED_AT,
      ...overrides,
    }) as Match;

  /** 잠근 행의 상태와 트랜잭션 안 조회(수정 전·후 순서) 결과를 정해 저장소를 만든다 */
  const createLoggingRepository = (lockedStatus: string, reads: Match[]) => {
    const statements: Statement[] = [];
    const transaction = {
      execute: vi.fn(async (statement: Statement) => {
        statements.push(statement);
        if (statement.sql.includes("FOR UPDATE")) {
          return { rows: [{ status: lockedStatus }], rowsAffected: 0 };
        }
        if (statement.sql.includes("SELECT player_id")) {
          return { rows: [], rowsAffected: 0 };
        }
        return { rows: [], rowsAffected: 1 };
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      db: {},
    };
    const client = { execute: vi.fn(), transaction: vi.fn(async () => transaction) };
    const repository = new MatchRepository({}, client);
    vi.spyOn(repository, "findById").mockResolvedValue({ id: "Mfix1" } as Match);
    const findByIdWith = vi.fn();
    for (const read of reads) findByIdWith.mockResolvedValueOnce(read);
    // 트랜잭션 커넥션 조회(private)를 수정 전·후 스냅샷으로 바꾼다
    (repository as unknown as { findByIdWith: typeof findByIdWith }).findByIdWith =
      findByIdWith;
    const logInsert = () =>
      statements.find((statement) => statement.sql.includes("INSERT INTO match_edit_logs"));
    return { repository, transaction, logInsert, findByIdWith };
  };

  const editInput: UpdateRecordedMatchInput = {
    ...baseInput,
    editLog: { id: "match-edit-1", editedByAdmin: false },
  };

  it("완료 경기를 고치면 수정 전·후 스냅샷을 같은 트랜잭션에 남긴다", async () => {
    const before = snapshot();
    const after = snapshot({ scores: [{ scoreA: 7, scoreB: 11 }] });
    const { repository, transaction, logInsert } = createLoggingRepository(
      "completed",
      [before, after],
    );

    await repository.updateRecordedMatch("Mfix1", editInput);

    const insert = logInsert()!;
    expect(insert.args.slice(0, 4)).toEqual([
      "match-edit-1",
      "Mfix1",
      "player-admin",
      false,
    ]);
    expect(JSON.parse(String(insert.args[4])).scores).toEqual(before.scores);
    expect(JSON.parse(String(insert.args[5])).scores).toEqual(after.scores);
    expect(insert.args[6]).toBe(SUBMITTED_AT.getTime() / 1000);
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("진행 중 경기에 첫 점수를 넣는 것은 남기지 않는다", async () => {
    const { repository, logInsert, findByIdWith } = createLoggingRepository(
      "created",
      [],
    );

    await repository.updateRecordedMatch("Mfix1", editInput);

    expect(findByIdWith).not.toHaveBeenCalled();
    expect(logInsert()).toBeUndefined();
  });

  it("바뀐 내용이 없으면 남기지 않는다", async () => {
    const { repository, logInsert } = createLoggingRepository("completed", [
      snapshot(),
      snapshot({ updatedAt: new Date() }),
    ]);

    await repository.updateRecordedMatch("Mfix1", editInput);

    expect(logInsert()).toBeUndefined();
  });
});
