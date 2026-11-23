import { MatchRepository } from "@pkpkdupr/db";
import type { SpecialMatch } from "@pkpkdupr/shared/specialMatch";
import { describe, expect, it, vi } from "vitest";

const createRepository = () => {
  const client = {
    execute: vi.fn().mockResolvedValue({ rows: [], rowsAffected: 1 }),
  };
  return { repository: new MatchRepository({}, client as never), client };
};

const specialMatch = {
  kind: "streak_stopper",
  outcome: "streak_stopped",
} as unknown as SpecialMatch;

describe("db MatchRepository.updateSpecialMatch", () => {
  it("special_match가 이미 NULL인 경기는 바꾸지 않도록 조건을 건다", async () => {
    const { repository, client } = createRepository();

    await repository.updateSpecialMatch("Mmatch01", specialMatch);

    const [statement] = client.execute.mock.calls[0]!;
    // 다른 회원이 팀을 바꿔 지운 특수 매치를 결과 저장이 되살리지 못하게 한다
    expect(statement.sql).toMatch(/WHERE id = \$1 AND special_match IS NOT NULL/);
    expect(statement.args).toEqual(["Mmatch01", JSON.stringify(specialMatch)]);
  });

  it("특수 매치가 있는 경기에 결과를 채우는 UPDATE는 updated_at을 올리지 않는다", async () => {
    const { repository, client } = createRepository();

    await repository.updateSpecialMatch("Mmatch01", specialMatch);

    const [statement] = client.execute.mock.calls[0]!;
    expect(statement.sql).toContain("SET special_match = $2::jsonb");
    expect(statement.sql).not.toContain("updated_at");
  });
});
