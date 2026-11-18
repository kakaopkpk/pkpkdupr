import { MatchRepository, RegularSessionConflictError } from "@pkpkdupr/db";
import { kstDateKeyToDate } from "@pkpkdupr/shared/session";
import { describe, expect, it, vi } from "vitest";

type Statement = { sql: string; args: unknown[] };

const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** 잠근 세션 행과 쉬는 날·같은 날 정기 세션 유무를 정한 트랜잭션 목 */
const createRepository = (options: {
  session: Record<string, unknown> | null;
  skipped?: boolean;
  regularExists?: boolean;
}) => {
  const statements: Statement[] = [];
  const execute = vi.fn(async (statement: Statement) => {
    statements.push(statement);
    if (statement.sql.includes("FOR UPDATE")) {
      return { rows: options.session ? [options.session] : [] };
    }
    if (statement.sql.includes("FROM regular_session_skips")) {
      return { rows: options.skipped ? [{ "?column?": 1 }] : [] };
    }
    if (statement.sql.includes("WHERE regular_date_key = $1")) {
      return { rows: options.regularExists ? [{ "?column?": 1 }] : [] };
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

const customRow = (dateKey: string) => ({
  kind: "custom",
  regular_date_key: null,
  date: String(toSeconds(kstDateKeyToDate(dateKey))),
});

const regularRow = (dateKey: string) => ({
  kind: "regular",
  regular_date_key: dateKey,
  date: String(toSeconds(kstDateKeyToDate(dateKey, 18))),
});

describe("MatchRepository.changeSessionKind", () => {
  it("회원 세션을 대회로 바꾸면 종류만 고치고 나머지 필드도 같은 트랜잭션에서 고친다", async () => {
    const { repository, transaction, statements } = createRepository({
      session: customRow("2026-11-14"),
    });

    await expect(
      repository.changeSessionKind("Scustom1", "tournament", { name: "가을 대회" }),
    ).resolves.toBe(true);

    const kindUpdate = statements.find((s) => s.sql.includes("SET kind = $2"));
    expect(kindUpdate?.args.slice(0, 2)).toEqual(["Scustom1", "tournament"]);
    const fieldUpdate = statements.find((s) => s.sql.includes("name = $2"));
    expect(fieldUpdate?.args.slice(0, 2)).toEqual(["Scustom1", "가을 대회"]);
    expect(statements.some((s) => s.sql.includes("regular_session_skips"))).toBe(false);
    expect(transaction.commit).toHaveBeenCalled();
  });

  it("오늘·미래 정기 세션을 다른 종류로 바꾸면 정기 시각을 남기고 그 날짜를 취소로 남긴다", async () => {
    const { repository, statements } = createRepository({
      session: regularRow("2026-11-16"),
    });

    await repository.changeSessionKind(
      "Sregular",
      "tournament",
      {},
      { cancelRegularFromDateKey: "2026-11-12" },
    );

    const update = statements.find((s) => s.sql.includes("regular_date_key = NULL"));
    expect(update?.args.slice(0, 5)).toEqual([
      "Sregular",
      "tournament",
      toSeconds(kstDateKeyToDate("2026-11-16")),
      "18:00",
      "22:00",
    ]);
    const skip = statements.find((s) => s.sql.includes("INSERT INTO regular_session_skips"));
    expect(skip?.args[0]).toBe("2026-11-16");
  });

  it("지난 정기 세션을 바꾸면 취소 날짜를 남기지 않는다", async () => {
    const { repository, statements } = createRepository({
      session: regularRow("2026-11-09"),
    });

    await repository.changeSessionKind(
      "Sregular",
      "custom",
      {},
      { cancelRegularFromDateKey: "2026-11-12" },
    );

    expect(
      statements.some((s) => s.sql.includes("INSERT INTO regular_session_skips")),
    ).toBe(false);
  });

  it("정기로 바꾸면 그날 정기 세션이 되고 시각을 비운다", async () => {
    const { repository, statements } = createRepository({
      session: customRow("2026-11-19"),
    });

    await repository.changeSessionKind("Scustom1", "regular");

    const update = statements.find((s) => s.sql.includes("SET kind = 'regular'"));
    expect(update?.args.slice(0, 3)).toEqual([
      "Scustom1",
      "2026-11-19",
      toSeconds(kstDateKeyToDate("2026-11-19", 18)),
    ]);
    expect(update?.sql).toContain("start_time = NULL");
  });

  it.each([
    ["쉬는 날", { skipped: true }, "쉬는 날에는 정기 세션을 둘 수 없어요."],
    ["그날 정기 세션이 있는 날", { regularExists: true }, "그 날짜에는 이미 정기 세션이 있어요."],
  ])("%s에는 정기로 바꿀 수 없고 아무것도 커밋하지 않는다", async (_label, flags, message) => {
    const { repository, transaction, statements } = createRepository({
      session: customRow("2026-11-19"),
      ...flags,
    });

    const result = repository.changeSessionKind("Scustom1", "regular");
    await expect(result).rejects.toBeInstanceOf(RegularSessionConflictError);
    await expect(result).rejects.toThrow(message);
    expect(statements.some((s) => s.sql.includes("UPDATE match_sessions"))).toBe(false);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalled();
  });

  it("없는 세션이면 false", async () => {
    const { repository } = createRepository({ session: null });

    await expect(repository.changeSessionKind("Snone001", "custom")).resolves.toBe(
      false,
    );
  });
});
