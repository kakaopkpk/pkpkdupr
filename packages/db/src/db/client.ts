import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type ReservedSql, type Sql } from "postgres";

/** raw SQL은 Postgres 위치 파라미터(`$1`, `$2`, ...)를 쓴다. */
export type RawStatement =
  | string
  | {
      sql: string;
      args?: unknown[];
    };

export interface RawQueryResult {
  rows: Record<string, unknown>[];
  /** INSERT/UPDATE/DELETE가 영향을 준 행 수. SELECT는 항상 0이다. */
  rowsAffected: number;
}

type SqlExecutor = Pick<Sql, "unsafe">;

/**
 * DATABASE_URL을 우선 쓰고, 없으면 Supabase Edge Function이 주입하는 SUPABASE_DB_URL(직접 연결)을 쓴다.
 * Edge 런타임은 환경 변수 쓰기를 막으므로(NotSupported) env를 고쳐 쓰지 않고 여기서 고른다.
 */
const resolveDatabaseUrl = () => {
  const url =
    process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  }
  return url;
};

const normalizeStatement = (statement: RawStatement) =>
  typeof statement === "string"
    ? { sql: statement, args: [] as unknown[] }
    : { sql: statement.sql, args: statement.args ?? [] };

const execute = async (
  executor: SqlExecutor,
  statement: RawStatement,
): Promise<RawQueryResult> => {
  const { sql, args } = normalizeStatement(statement);
  const result = await executor.unsafe(sql, args as postgres.ParameterOrJSON<never>[]);
  return {
    rows: [...result] as Record<string, unknown>[],
    rowsAffected: result.command === "SELECT" ? 0 : Number(result.count ?? 0),
  };
};

/**
 * 커넥션 하나를 예약해 BEGIN~COMMIT/ROLLBACK을 직접 제어하는 트랜잭션.
 * 저장소는 `commit()`이 성공하지 못한 경로에서 `close()`로 롤백한다.
 */
class PostgresTransaction {
  private closed = false;

  constructor(private readonly connection: ReservedSql) {}

  async execute(statement: RawStatement): Promise<RawQueryResult> {
    return await execute(this.connection, statement);
  }

  async commit() {
    if (this.closed) return;
    // COMMIT이 실패하면 closed를 세우지 않아 호출부의 close()가 롤백·반납한다.
    await this.connection.unsafe("COMMIT");
    this.closed = true;
    this.connection.release();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    void this.connection
      .unsafe("ROLLBACK")
      .catch(() => undefined)
      .finally(() => this.connection.release());
  }
}

class PostgresClient {
  constructor(private readonly sql: Sql) {}

  async execute(statement: RawStatement): Promise<RawQueryResult> {
    return await execute(this.sql, statement);
  }

  async transaction(_mode?: "write") {
    const connection = await this.sql.reserve();
    try {
      await connection.unsafe("BEGIN");
    } catch (error) {
      connection.release();
      throw error;
    }
    return new PostgresTransaction(connection);
  }

  /**
   * 트랜잭션 advisory 잠금(`pg_advisory_xact_lock`)을 잡은 채 fn을 실행하고, 끝나면 COMMIT/ROLLBACK으로 놓는다.
   * 잠금은 상호 배제용이라 fn 안의 쿼리는 이 트랜잭션이 아닌 풀의 다른 커넥션으로 실행된다.
   * 세션 잠금이 아니라 트랜잭션 잠금이라 풀러(transaction mode)에서도 커넥션 반납과 함께 풀린다.
   * 같은 키로 중첩 호출하면 다른 커넥션이 같은 잠금을 기다리며 교착되므로 바깥에서 한 번만 잡는다.
   */
  async withAdvisoryXactLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
    const transaction = await this.transaction();
    let result: T;
    try {
      await transaction.execute({
        sql: "SELECT pg_advisory_xact_lock($1)",
        args: [key],
      });
      result = await fn();
    } catch (error) {
      transaction.close();
      throw error;
    }
    try {
      await transaction.commit();
    } finally {
      transaction.close();
    }
    return result;
  }

  async close() {
    await this.sql.end();
  }
}

export type DbClient = PostgresClient;
export type Db = PostgresJsDatabase;

let _sql: Sql | undefined;
let _client: PostgresClient | undefined;
let _db: Db | undefined;

/**
 * postgres.js 연결 풀. Node와 Deno(Supabase Edge Function) 모두에서 동작한다.
 */
export const getSqlClient = () => {
  if (!_sql) {
    _sql = postgres(resolveDatabaseUrl(), {
      // Supabase 풀러(Supavisor) transaction 모드는 prepared statement를 지원하지 않는다.
      prepare: false,
      onnotice: () => undefined,
      // postgres.js는 undefined 파라미터를 연결 콜백에서 throw해 프로세스를 죽일 수 있으므로 NULL로 보낸다.
      transform: { undefined: null },
      types: {
        // Unix 초 타임스탬프와 COUNT(*) 결과(int8)를 기존 저장소처럼 number로 받는다.
        // 두 값 모두 Number.MAX_SAFE_INTEGER 안에 있다.
        bigint: {
          to: 20,
          from: [20],
          serialize: (value: number | bigint | string) => String(value),
          parse: (value: string) => Number(value),
        },
      },
    });
  }
  return _sql;
};

export const getDbClient = () => {
  if (!_client) {
    _client = new PostgresClient(getSqlClient());
  }
  return _client;
};

export const getDb = () => {
  if (!_db) {
    _db = drizzle(getSqlClient());
  }
  return _db;
};

/** `$start`부터 시작하는 위치 파라미터 목록(`$3, $4, $5`)을 만든다. */
export const placeholders = (count: number, start = 1) =>
  Array.from({ length: count }, (_, index) => `$${start + index}`).join(", ");

/** 조회 결과의 첫 행을 꺼낸다. 단건 조회는 `.limit(1).then(firstRow)`로 쓴다. */
export const firstRow = <T>(rows: T[]): T | undefined => rows[0];
