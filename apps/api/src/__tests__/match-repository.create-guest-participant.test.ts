import { MatchRepository, PlayerRepository } from "@pkpkdupr/db";
import { afterEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-11-12T10:00:00+09:00");

const guestInput = {
  id: "Pguest01",
  username: "guest_kim",
  duprRating: null,
  gender: null,
  status: "active" as const,
  isGuest: true,
  guestAddedByPlayerId: "Pmember1",
  guestAddedSessionId: "Scustom1",
  createdAt: now,
  updatedAt: now,
};

const createRepository = (
  execute: (statement: { sql: string; args: unknown[] }) => Promise<unknown>,
) => {
  const transaction = {
    execute: vi.fn(execute),
    commit: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    db: { transactionDb: true },
  };
  const client = {
    execute: vi.fn(),
    transaction: vi.fn(async () => transaction),
  };
  const repository = new MatchRepository({}, client);
  return { repository, transaction, client };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("db MatchRepository.createGuestParticipant", () => {
  it("게스트 행과 참여자 행을 같은 트랜잭션에서 쓰고 커밋한다", async () => {
    let createdWith: unknown;
    const create = vi
      .spyOn(PlayerRepository.prototype, "create")
      .mockImplementation(async function (this: unknown, input) {
        createdWith = (this as { db: unknown }).db;
        return { ...input, authUserId: null, isFirstLogin: false } as any;
      });
    const { repository, transaction } = createRepository(async () => ({
      rows: [],
      rowsAffected: 1,
    }));

    const created = await repository.createGuestParticipant(
      "Scustom1",
      guestInput,
    );

    expect(created.id).toBe("Pguest01");
    expect(create).toHaveBeenCalledWith(guestInput);
    // 게스트 insert는 풀이 아니라 트랜잭션 커넥션으로 실행한다
    expect(createdWith).toBe(transaction.db);
    const statements = transaction.execute.mock.calls.map(([statement]) => statement);
    expect(statements[0]!.sql).toContain("INSERT INTO match_session_participants");
    expect(statements[0]!.args).toEqual([
      "Scustom1-Pguest01",
      "Scustom1",
      "Pguest01",
      expect.any(Number),
    ]);
    expect(statements[1]!.sql).toContain("UPDATE match_sessions");
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.close).not.toHaveBeenCalled();
  });

  it("참여자 추가가 실패하면 커밋하지 않고 롤백해 게스트 행을 남기지 않는다", async () => {
    vi.spyOn(PlayerRepository.prototype, "create").mockImplementation(
      async (input) =>
        ({ ...input, authUserId: null, isFirstLogin: false }) as any,
    );
    const failure = new Error(
      "insert or update on table violates foreign key constraint",
    );
    const { repository, transaction } = createRepository(async ({ sql }) => {
      if (sql.includes("INSERT INTO match_session_participants")) {
        throw failure;
      }
      return { rows: [], rowsAffected: 1 };
    });

    await expect(
      repository.createGuestParticipant("Scustom1", guestInput),
    ).rejects.toBe(failure);

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });

  it("게스트 insert가 유니크 위반이면 그 오류를 그대로 던지고 롤백한다", async () => {
    const duplicate = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    vi.spyOn(PlayerRepository.prototype, "create").mockRejectedValue(duplicate);
    const { repository, transaction } = createRepository(async () => ({
      rows: [],
      rowsAffected: 1,
    }));

    await expect(
      repository.createGuestParticipant("Scustom1", guestInput),
    ).rejects.toBe(duplicate);

    expect(transaction.execute).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.close).toHaveBeenCalledTimes(1);
  });

  it("세션 ID 형식이 틀리면 트랜잭션을 열지 않는다", async () => {
    const { repository, client } = createRepository(async () => ({
      rows: [],
      rowsAffected: 1,
    }));

    await expect(
      repository.createGuestParticipant("not-a-session", guestInput),
    ).rejects.toThrow("유효한 세션 ID");
    expect(client.transaction).not.toHaveBeenCalled();
  });
});
