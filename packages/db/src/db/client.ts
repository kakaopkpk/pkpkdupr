import { drizzle } from "drizzle-orm/mysql2";
import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

export type RawStatement =
  | string
  | {
      sql: string;
      args?: unknown[];
    };

export interface RawQueryResult {
  rows: RowDataPacket[];
  rowsAffected: number;
}

type MySqlExecutor = Pick<Pool, "execute"> | Pick<PoolConnection, "execute">;

const resolveDatabaseConfig = () => ({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "pkpkdupr",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "pkpkdupr",
  charset: "utf8mb4",
  timezone: "Z",
});

const normalizeStatement = (statement: RawStatement) =>
  typeof statement === "string"
    ? { sql: statement, args: [] as unknown[] }
    : { sql: statement.sql, args: statement.args ?? [] };

const execute = async (
  executor: MySqlExecutor,
  statement: RawStatement,
): Promise<RawQueryResult> => {
  const { sql, args } = normalizeStatement(statement);
  const [result] = await executor.execute(sql, args as any);
  if (Array.isArray(result)) {
    return { rows: result as RowDataPacket[], rowsAffected: 0 };
  }

  return {
    rows: [],
    rowsAffected: Number((result as ResultSetHeader).affectedRows ?? 0),
  };
};

class MySqlTransaction {
  private closed = false;

  constructor(private readonly connection: PoolConnection) {}

  async execute(statement: RawStatement): Promise<RawQueryResult> {
    return await execute(this.connection, statement);
  }

  async commit() {
    if (this.closed) return;
    await this.connection.commit();
    this.closed = true;
    this.connection.release();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    void this.connection.rollback().finally(() => this.connection.release());
  }
}

class MySqlClient {
  constructor(private readonly pool: Pool) {}

  async execute(statement: RawStatement): Promise<RawQueryResult> {
    return await execute(this.pool, statement);
  }

  async transaction(_mode?: "write") {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    return new MySqlTransaction(connection);
  }

  async close() {
    await this.pool.end();
  }
}

let _pool: Pool | undefined;
let _client: MySqlClient | undefined;
let _db: any;

const withLegacySelectHelpers = <T>(value: T): T => {
  if (value instanceof Promise) {
    return value;
  }
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  return new Proxy(value as object, {
    get(target, property, receiver) {
      if (property === "all") {
        return async () => await (target as { execute: () => Promise<unknown> }).execute();
      }
      if (property === "get") {
        return async () => {
          const rows = (await (target as { execute: () => Promise<unknown[]> }).execute()) ?? [];
          return rows[0];
        };
      }

      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function") return member;
      return (...args: unknown[]) => withLegacySelectHelpers(member.apply(target, args));
    },
  }) as T;
};

export const getPool = () => {
  if (!_pool) {
    _pool = mysql.createPool({
      ...resolveDatabaseConfig(),
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    });
  }
  return _pool;
};

export const getDbClient = () => {
  if (!_client) {
    _client = new MySqlClient(getPool());
  }
  return _client;
};

export const getDb = () => {
  if (!_db) {
    _db = withLegacySelectHelpers(drizzle(getPool()));
  }
  return _db;
};
