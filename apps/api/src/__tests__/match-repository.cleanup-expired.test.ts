import { MatchRepository } from "@pkpkdupr/db";
import {
  getEmptySessionExpiresAt,
  IN_PROGRESS_MATCH_TIMEOUT_MS,
} from "@pkpkdupr/shared/session";
import { describe, expect, it, vi } from "vitest";

const createRepository = (rows: unknown[]) => {
  const execute = vi.fn().mockResolvedValue({ rows, rowsAffected: 0 });
  const transaction = vi.fn();
  const repository = new MatchRepository({}, { execute, transaction });
  return { repository, execute, transaction };
};

const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

type ExecuteArgs = { sql: string; args: unknown[] };

const executedStatement = (execute: ReturnType<typeof vi.fn>): ExecuteArgs =>
  execute.mock.calls[0]![0] as ExecuteArgs;

// 2026-11-09는 월요일(KST)
const now = new Date("2026-11-09T22:00:00+09:00");

describe("MatchRepository.deleteExpiredInProgressMatchesAndEmptySessions", () => {
  it("지울 대상이 없어도 execute 1회로 끝나고 트랜잭션을 열지 않는다", async () => {
    const { repository, execute, transaction } = createRepository([
      { deleted_match_count: "0", deleted_session_count: "0" },
    ]);

    await expect(
      repository.deleteExpiredInProgressMatchesAndEmptySessions(now),
    ).resolves.toEqual({
      deletedMatchCount: 0,
      deletedSessionCount: 0,
      deletedSessionIds: [],
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("지울 대상이 있어도 execute 1회로 끝나고 삭제 수를 숫자로, 지운 세션 id를 목록으로 돌려준다", async () => {
    const { repository, execute, transaction } = createRepository([
      {
        deleted_match_count: "2",
        deleted_session_count: "2",
        deleted_session_ids: "Sfirst,Ssecond",
      },
    ]);

    await expect(
      repository.deleteExpiredInProgressMatchesAndEmptySessions(now),
    ).resolves.toEqual({
      deletedMatchCount: 2,
      deletedSessionCount: 2,
      deletedSessionIds: ["Sfirst", "Ssecond"],
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("경기·세션과 딸린 행을 모두 한 문장에서 지우고, 진행 중 경기는 잠근 뒤 지운다", async () => {
    const { repository, execute } = createRepository([
      { deleted_match_count: 0, deleted_session_count: 0 },
    ]);

    await repository.deleteExpiredInProgressMatchesAndEmptySessions(now);

    const { sql } = executedStatement(execute);
    for (const table of [
      "matches",
      "match_scores",
      "match_participants",
      "match_sessions",
      "match_session_participants",
    ]) {
      expect(sql).toMatch(new RegExp(`DELETE FROM ${table}\\b`));
    }
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/m\.status = 'created'/);
    // 같은 문장이 지우는 경기는 빼고 빈 세션을 판정한다
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM deleted_matches d/);
  });

  it("진행 중 경기 만료 기준은 now - IN_PROGRESS_MATCH_TIMEOUT_MS(epoch 초)다", async () => {
    const { repository, execute } = createRepository([]);

    await expect(
      repository.deleteExpiredInProgressMatchesAndEmptySessions(now),
    ).resolves.toEqual({
      deletedMatchCount: 0,
      deletedSessionCount: 0,
      deletedSessionIds: [],
    });

    const { args } = executedStatement(execute);
    expect(args[0]).toBe(
      toSeconds(new Date(now.getTime() - IN_PROGRESS_MATCH_TIMEOUT_MS)),
    );
  });

  // SQL은 정기 세션에 `"date" < $2`, 그 외 세션에 `"date" < $3`을 쓴다
  const isExpiredBySqlArgs = (
    kind: "regular" | "custom",
    sessionDate: Date,
    args: unknown[],
  ) => toSeconds(sessionDate) < Number(kind === "regular" ? args[1] : args[2]);

  it.each([
    ["regular", "2026-11-09T18:00:00+09:00"],
    ["regular", "2026-11-09T19:30:00+09:00"],
    ["custom", "2026-11-09T20:15:00+09:00"],
    ["custom", "2026-11-09T00:00:00+09:00"],
  ] as const)(
    "%s 세션(%s)의 SQL 기준값 판정은 만료 1초 전엔 남기고 정각엔 지워 getEmptySessionExpiresAt과 같다",
    async (kind, sessionDateIso) => {
      const sessionDate = new Date(sessionDateIso);
      const expiresAt = getEmptySessionExpiresAt(kind, sessionDate);
      const oneSecondBefore = new Date(expiresAt.getTime() - 1000);

      const before = createRepository([]);
      await before.repository.deleteExpiredInProgressMatchesAndEmptySessions(
        oneSecondBefore,
      );
      expect(
        isExpiredBySqlArgs(
          kind,
          sessionDate,
          executedStatement(before.execute).args,
        ),
      ).toBe(false);

      const atExpiry = createRepository([]);
      await atExpiry.repository.deleteExpiredInProgressMatchesAndEmptySessions(
        expiresAt,
      );
      expect(
        isExpiredBySqlArgs(
          kind,
          sessionDate,
          executedStatement(atExpiry.execute).args,
        ),
      ).toBe(true);
    },
  );

  it("자정을 넘기는 회원 세션은 SQL이 date + 하루 + 종료 시각을 now(epoch 초)와 비교한다", async () => {
    const { repository, execute } = createRepository([]);

    await repository.deleteExpiredInProgressMatchesAndEmptySessions(now);

    const { sql, args } = executedStatement(execute);
    expect(sql).toMatch(/s\.end_time <= s\.start_time/);
    expect(sql).toMatch(/s\."date" \+ 86400 \+/);
    expect(sql).toMatch(/<= \$4/);
    expect(args[3]).toBe(toSeconds(now));

    // SQL과 같은 계산: 11월 9일 23:30~다음 날 01:30 세션은 11월 10일 01:30 KST에 만료된다
    const sessionDate = new Date("2026-11-09T00:00:00+09:00");
    const expiresAt = getEmptySessionExpiresAt("custom", sessionDate, {
      startTime: "23:30",
      endTime: "01:30",
    });
    expect(toSeconds(sessionDate) + 86400 + 90 * 60).toBe(toSeconds(expiresAt));
  });

  it.each([
    ["regular", "2026-11-12T18:00:00+09:00"],
    ["custom", "2026-11-10T00:00:00+09:00"],
    ["custom", "2026-11-20T00:00:00+09:00"],
  ] as const)(
    "미래 %s 세션(%s)은 지금 지우지 않고, 그날 만료 시각이 지나면 지운다",
    async (kind, sessionDateIso) => {
      const sessionDate = new Date(sessionDateIso);

      const current = createRepository([]);
      await current.repository.deleteExpiredInProgressMatchesAndEmptySessions(
        now,
      );
      expect(
        isExpiredBySqlArgs(
          kind,
          sessionDate,
          executedStatement(current.execute).args,
        ),
      ).toBe(false);

      const afterExpiry = createRepository([]);
      await afterExpiry.repository.deleteExpiredInProgressMatchesAndEmptySessions(
        getEmptySessionExpiresAt(kind, sessionDate),
      );
      expect(
        isExpiredBySqlArgs(
          kind,
          sessionDate,
          executedStatement(afterExpiry.execute).args,
        ),
      ).toBe(true);
    },
  );
});
