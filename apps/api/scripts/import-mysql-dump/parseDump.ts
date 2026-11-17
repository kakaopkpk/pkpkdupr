/**
 * mysqldump(.sql) 출력을 MySQL 서버 없이 읽는다.
 * `CREATE TABLE`에서 컬럼 순서를, 한 줄짜리 `INSERT INTO ... VALUES (...),(...);`에서 행을 꺼낸다.
 * 값은 문자열(따옴표), 숫자, NULL만 다룬다. v0.12.7 스키마에는 바이너리·날짜 타입 컬럼이 없다.
 */

export type DumpValue = string | number | null;
export type DumpRow = Record<string, DumpValue>;
export type DumpTables = Record<string, DumpRow[]>;

// mysqldump가 문자열 안에서 쓰는 백슬래시 이스케이프
const ESCAPES: Record<string, string> = {
  "0": "\0",
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
};

const parseColumns = (text: string): Map<string, string[]> => {
  const columnsByTable = new Map<string, string[]>();
  const createTable = /CREATE TABLE `(\w+)` \(([\s\S]*?)\n\) ENGINE/g;
  for (const match of text.matchAll(createTable)) {
    const columns = [...match[2].matchAll(/^\s+`(\w+)`/gm)].map(
      (column) => column[1],
    );
    columnsByTable.set(match[1], columns);
  }
  return columnsByTable;
};

const parseUnquoted = (token: string, table: string): DumpValue => {
  if (token === "NULL") return null;
  const value = Number(token);
  if (token === "" || !Number.isFinite(value)) {
    throw new Error(`${table}: 해석할 수 없는 값 ${token}`);
  }
  return value;
};

/** `(…),(…)` 목록을 값 배열 목록으로 나눈다 */
export const parseValuesList = (input: string, table: string): DumpValue[][] => {
  const tuples: DumpValue[][] = [];
  let index = 0;
  const fail = (reason: string): never => {
    throw new Error(
      `${table}: ${reason} (위치 ${index}: ${input.slice(index, index + 30)})`,
    );
  };

  while (index < input.length) {
    if (input[index] !== "(") fail("'('가 필요합니다");
    index += 1;
    const values: DumpValue[] = [];
    for (;;) {
      if (input[index] === "'") {
        index += 1;
        let value = "";
        for (;;) {
          if (index >= input.length) fail("문자열이 닫히지 않았습니다");
          const char = input[index];
          if (char === "\\") {
            const escaped = input[index + 1];
            value += ESCAPES[escaped] ?? escaped;
            index += 2;
          } else if (char === "'") {
            if (input[index + 1] === "'") {
              value += "'";
              index += 2;
            } else {
              index += 1;
              break;
            }
          } else {
            value += char;
            index += 1;
          }
        }
        values.push(value);
      } else {
        let end = index;
        while (end < input.length && input[end] !== "," && input[end] !== ")") {
          end += 1;
        }
        values.push(parseUnquoted(input.slice(index, end).trim(), table));
        index = end;
      }

      if (input[index] === ",") {
        index += 1;
        continue;
      }
      if (input[index] === ")") {
        index += 1;
        break;
      }
      fail("',' 또는 ')'가 필요합니다");
    }
    tuples.push(values);
    if (input[index] === ",") index += 1;
  }
  return tuples;
};

/** 덤프 전체를 테이블별 행 목록으로 읽는다. 데이터가 없는 테이블은 빈 배열이다 */
export const parseMysqlDump = (text: string): DumpTables => {
  const columnsByTable = parseColumns(text);
  const tables: DumpTables = {};
  for (const table of columnsByTable.keys()) {
    tables[table] = [];
  }

  for (const line of text.split("\n")) {
    const insert = /^INSERT INTO `(\w+)` VALUES (.*);$/.exec(line);
    if (!insert) continue;
    const [, table, valuesList] = insert;
    const columns = columnsByTable.get(table);
    if (!columns) {
      throw new Error(`${table}: CREATE TABLE이 없는 INSERT입니다.`);
    }
    for (const values of parseValuesList(valuesList, table)) {
      if (values.length !== columns.length) {
        throw new Error(
          `${table}: 컬럼 ${columns.length}개인데 값이 ${values.length}개입니다.`,
        );
      }
      tables[table].push(
        Object.fromEntries(columns.map((column, i) => [column, values[i]])),
      );
    }
  }
  return tables;
};
