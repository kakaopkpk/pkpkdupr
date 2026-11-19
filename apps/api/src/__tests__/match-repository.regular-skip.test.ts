import { MatchRepository } from "@pkpkdupr/db";
import { describe, expect, it, vi } from "vitest";

type Statement = { sql: string; args: unknown[] };

/** SELECT 결과를 정한 트랜잭션 목. 정기 쉬는 날 INSERT는 insertedSkip이면 행 하나를 돌려준다 */
const createRepository = (options: {
  session?: Record<string, unknown> | null;
  insertedSkip?: boolean;
}) => {
  const statements: Statement[] = [];
  const execute = vi.fn(async (statement: Statement) => {
    statements.push(statement);
    if (statement.sql.includes("INSERT INTO regular_session_skips")) {
      return { rows: options.insertedSkip ? [{ date_key: statement.args[0] }] : [] };
    }
    if (statement.sql.includes("SELECT id") && statement.sql.includes("FROM match_sessions")) {
      return { rows: options.session ? [options.session] : [] };
    }
    if (statement.sql.includes("COUNT(*)")) {
      return { rows: [{ count: 0 }] };
    }
    return { rows: [] };
  });
  const transaction = {
    execute,
    commit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  const client = { execute: vi.fn(), transaction: vi.fn(async () => transaction) };
  const repository = new MatchRepository({}, client);
  return { repository, transaction, statements };
};

const insertsSkip = (statements: Statement[]) =>
  statements.some((s) => s.sql.includes("INSERT INTO regular_session_skips"));

describe("MatchRepository.deleteSession 정기 쉬는 날", () => {
  it("오늘·미래 자동 정기 세션을 지우면 그 날짜를 정기 쉬는 날로 남긴다", async () => {
    const { repository, statements } = createRepository({
      session: { id: "Sregular", regular_date_key: "2026-11-16", auto_created: true },
    });

    await expect(
      repository.deleteSession("Sregular", { cancelRegularFromDateKey: "2026-11-12" }),
    ).resolves.toBe(true);

    const skip = statements.find((s) => s.sql.includes("INSERT INTO regular_session_skips"));
    expect(skip?.args[0]).toBe("2026-11-16");
  });

  it("직접 만든 정기 세션을 지우면 정기 쉬는 날을 남기지 않는다", async () => {
    const { repository, statements } = createRepository({
      session: { id: "Sregular", regular_date_key: "2026-11-16", auto_created: false },
    });

    await expect(
      repository.deleteSession("Sregular", { cancelRegularFromDateKey: "2026-11-12" }),
    ).resolves.toBe(true);

    expect(insertsSkip(statements)).toBe(false);
  });

  it("지난 자동 정기 세션을 지우면 정기 쉬는 날을 남기지 않는다", async () => {
    const { repository, statements } = createRepository({
      session: { id: "Sregular", regular_date_key: "2026-11-09", auto_created: true },
    });

    await repository.deleteSession("Sregular", { cancelRegularFromDateKey: "2026-11-12" });

    expect(insertsSkip(statements)).toBe(false);
  });
});

describe("MatchRepository.addRegularSessionCancellation", () => {
  it("그날 자동 정기 세션만 찾아 지운다", async () => {
    const { repository, statements } = createRepository({
      session: { id: "Sregular" },
      insertedSkip: true,
    });

    await expect(repository.addRegularSessionCancellation("2026-11-16")).resolves.toEqual({
      deletedSessionId: "Sregular",
    });

    const lookup = statements.find(
      (s) => s.sql.includes("SELECT id") && s.sql.includes("regular_date_key = $1"),
    );
    expect(lookup?.sql).toContain("auto_created");
    expect(
      statements.some((s) => s.sql.includes("DELETE FROM match_sessions")),
    ).toBe(true);
  });

  it("자동 정기 세션이 없으면(직접 만든 정기만 있어도) 쉬는 날만 남긴다", async () => {
    const { repository, statements } = createRepository({
      session: null,
      insertedSkip: true,
    });

    await expect(repository.addRegularSessionCancellation("2026-11-16")).resolves.toEqual({
      deletedSessionId: null,
    });
    expect(
      statements.some((s) => s.sql.includes("DELETE FROM match_sessions")),
    ).toBe(false);
  });
});
