import {
  MatchNotFoundError,
  MatchRepository,
  MatchStaleUpdateError,
} from "@pkpkdupr/db";
import { describe, expect, it, vi } from "vitest";

const UPDATED_AT_SECONDS = 1_784_000_000;

const storedMatch = {
  id: "Mdelete1",
  type: "mixed-doubles",
  source: "player_created",
  creatorPlayerId: "player-1",
  name: null,
  sessionId: null,
  sessionName: null,
  status: "completed",
  resultSubmittedByPlayerId: null,
  resultSubmittedAt: null,
  location: "야탑초등학교",
  courtName: null,
  matchStartsAt: UPDATED_AT_SECONDS - 3600,
  createdAt: UPDATED_AT_SECONDS - 3600,
  completedAt: UPDATED_AT_SECONDS - 1800,
  updatedAt: UPDATED_AT_SECONDS,
};

// drizzle의 select().from().where().orderBy()/limit() 체인을 흉내 내는 조회 실행기. 호출 수를 센다.
const createSelectExecutor = (rows: unknown[]) => {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
    return chain;
  });
  return { select };
};

const createRepository = (options: {
  lockedRows?: Record<string, unknown>[];
  deletedRows?: Record<string, unknown>[];
  matchRows?: unknown[];
}) => {
  const lockedRows = options.lockedRows ?? [
    { status: "completed", updated_at: UPDATED_AT_SECONDS },
  ];
  const deletedRows = options.deletedRows ?? [{ status: "completed" }];
  const execute = vi.fn(async ({ sql }: { sql: string }) => {
    if (sql.includes("FOR UPDATE")) {
      return { rows: lockedRows, rowsAffected: 0 };
    }
    if (sql.includes("DELETE FROM matches")) {
      return { rows: deletedRows, rowsAffected: deletedRows.length };
    }
    return { rows: [], rowsAffected: 1 };
  });
  const transactionDb = createSelectExecutor(options.matchRows ?? [storedMatch]);
  const transaction = {
    execute,
    commit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    db: transactionDb,
  };
  const poolDb = createSelectExecutor([storedMatch]);
  const client = { execute: vi.fn(), transaction: vi.fn(async () => transaction) };
  const repository = new MatchRepository(poolDb, client);
  return { repository, transaction, transactionDb, poolDb, client, execute };
};

const input = {
  logId: "log-1",
  deletedByPlayerId: "player-1",
  deletedByAdmin: false,
  deletedAt: new Date("2026-11-13T00:00:00.000Z"),
};

describe("MatchRepository.deleteRecordedMatch 커넥션 사용", () => {
  it("행 잠금을 쥔 동안 스냅샷을 트랜잭션 커넥션으로만 읽고 풀은 쓰지 않는다", async () => {
    const { repository, transaction, transactionDb, poolDb, client } =
      createRepository({});

    const result = await repository.deleteRecordedMatch("Mdelete1", input);

    expect(poolDb.select).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
    expect(transactionDb.select).toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.match.id).toBe("Mdelete1");
  });

  it("반환 match와 감사 로그 matchSnapshot이 같은 내용이다", async () => {
    const { repository, execute } = createRepository({});

    const result = await repository.deleteRecordedMatch("Mdelete1", input);

    const logInsert = execute.mock.calls
      .map(([statement]) => statement as { sql: string; args: unknown[] })
      .find(({ sql }) => sql.includes("match_deletion_logs"));
    expect(logInsert).toBeDefined();
    expect(JSON.parse(String(logInsert!.args[4]))).toEqual(
      JSON.parse(JSON.stringify(result.match)),
    );
  });

  it("expectedUpdatedAt이 다르면 먼저 고쳤다는 오류로 롤백하고 삭제하지 않는다", async () => {
    const { repository, transaction, execute } = createRepository({});

    await expect(
      repository.deleteRecordedMatch("Mdelete1", {
        ...input,
        expectedUpdatedAt: new Date((UPDATED_AT_SECONDS - 5) * 1000),
      }),
    ).rejects.toBeInstanceOf(MatchStaleUpdateError);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
    expect(
      execute.mock.calls.some(([{ sql }]) => sql.includes("DELETE FROM")),
    ).toBe(false);
  });

  it("없는 경기는 MatchNotFoundError로 롤백한다", async () => {
    const { repository, transaction } = createRepository({ lockedRows: [] });

    await expect(
      repository.deleteRecordedMatch("Mdelete1", input),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });

  it("스냅샷을 읽는 중 경기가 없으면 MatchNotFoundError로 롤백한다", async () => {
    const { repository, transaction } = createRepository({ matchRows: [] });

    await expect(
      repository.deleteRecordedMatch("Mdelete1", input),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });
});
