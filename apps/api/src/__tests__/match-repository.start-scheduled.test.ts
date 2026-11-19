import { MatchRepository } from "@pkpkdupr/db";
import type { Match } from "@pkpkdupr/shared/match";
import { IN_PROGRESS_MATCH_TIMEOUT_MS } from "@pkpkdupr/shared/session";
import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-11-21T10:00:00+09:00");
const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

type Statement = { sql: string; args: unknown[] };

const createRepository = (options: {
  lockedStatus?: string;
  participantIds?: string[];
  busyPlayerIds?: string[];
}) => {
  const execute = vi.fn(async (statement: Statement | string) => {
    const sql = typeof statement === "string" ? statement : statement.sql;
    if (sql.includes("FOR UPDATE")) {
      return {
        rows:
          options.lockedStatus === undefined
            ? []
            : [{ status: options.lockedStatus }],
        rowsAffected: 0,
      };
    }
    if (sql.includes("SELECT player_id FROM match_participants")) {
      return {
        rows: (options.participantIds ?? []).map((player_id) => ({ player_id })),
        rowsAffected: 0,
      };
    }
    if (sql.includes("SELECT DISTINCT p.player_id")) {
      return {
        rows: (options.busyPlayerIds ?? []).map((player_id) => ({ player_id })),
        rowsAffected: 0,
      };
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
  const findById = vi
    .spyOn(repository, "findById")
    .mockResolvedValue({ id: "Mbracket", status: "created" } as Match);
  return { repository, transaction, execute, findById };
};

const statements = (execute: ReturnType<typeof vi.fn>) =>
  execute.mock.calls.map(([statement]) =>
    typeof statement === "string"
      ? { sql: statement, args: [] }
      : (statement as Statement),
  );

describe("MatchRepository.startScheduledMatch", () => {
  it("진행 중 경기 시작과 같은 잠금 안에서 scheduled를 created로, 시작 시각을 지금으로 바꾼다", async () => {
    const { repository, transaction, execute, findById } = createRepository({
      lockedStatus: "scheduled",
      participantIds: ["Pa", "Pb"],
    });

    await expect(
      repository.startScheduledMatch("Mbracket", now),
    ).resolves.toEqual({ match: { id: "Mbracket", status: "created" } });

    const executed = statements(execute);
    expect(executed[0]!.sql).toBe(
      "SELECT pg_advisory_xact_lock(hashtext('pkpkdupr:start-in-progress-match'))",
    );
    const busyCheck = executed.find((statement) =>
      statement.sql.includes("SELECT DISTINCT p.player_id"),
    )!;
    expect(busyCheck.sql).toMatch(/m\.status = 'created'/);
    expect(busyCheck.args).toEqual([
      toSeconds(new Date(now.getTime() - IN_PROGRESS_MATCH_TIMEOUT_MS)),
      toSeconds(now),
      "Pa",
      "Pb",
    ]);
    const update = executed.find((statement) =>
      statement.sql.includes("UPDATE matches"),
    )!;
    expect(update.sql).toMatch(/SET status = 'created'/);
    expect(update.sql).toMatch(/match_starts_at = \$1/);
    expect(update.args).toEqual([toSeconds(now), "Mbracket"]);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith("Mbracket");
  });

  it("경기가 없으면 아무것도 바꾸지 않고 not_found다", async () => {
    const { repository, transaction, execute } = createRepository({});

    await expect(
      repository.startScheduledMatch("Mbracket", now),
    ).resolves.toEqual({ reason: "not_found" });
    expect(
      statements(execute).some((statement) => statement.sql.includes("UPDATE matches")),
    ).toBe(false);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });

  it.each(["created", "completed", "cancelled"])(
    "%s 경기면 바꾸지 않고 not_scheduled다",
    async (status) => {
      const { repository, transaction, execute } = createRepository({
        lockedStatus: status,
        participantIds: ["Pa"],
      });

      await expect(
        repository.startScheduledMatch("Mbracket", now),
      ).resolves.toEqual({ reason: "not_scheduled" });
      expect(
        statements(execute).some((statement) =>
          statement.sql.includes("UPDATE matches"),
        ),
      ).toBe(false);
      expect(transaction.commit).not.toHaveBeenCalled();
    },
  );

  it("선수 중 누가 이미 진행 중 경기에 있으면 바꾸지 않고 그 첫 선수 id를 돌려준다", async () => {
    const { repository, transaction, execute } = createRepository({
      lockedStatus: "scheduled",
      participantIds: ["Pa", "Pb", "Pc"],
      busyPlayerIds: ["Pc", "Pb"],
    });

    await expect(
      repository.startScheduledMatch("Mbracket", now),
    ).resolves.toEqual({ reason: "player_busy", conflictPlayerId: "Pb" });
    expect(
      statements(execute).some((statement) => statement.sql.includes("UPDATE matches")),
    ).toBe(false);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });
});
