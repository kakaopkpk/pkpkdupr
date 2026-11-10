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

/** `supabase start`가 띄우는 로컬 Postgres의 기본 접속 문자열. */
const LOCAL_SUPABASE_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const resolveDatabaseUrl = () => {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  }
  return LOCAL_SUPABASE_DATABASE_URL;
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
