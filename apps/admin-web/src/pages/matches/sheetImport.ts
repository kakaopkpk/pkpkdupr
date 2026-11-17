import type {
  AdminBatchMatchItemRequest,
  MatchType,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { parseLineupScore } from "./matchLineup";

export const REQUIRED_IMPORT_HEADERS = [
  "경기번호",
  "날짜",
  "A팀 선수1",
  "A팀 선수2",
  "B팀 선수1",
  "B팀 선수2",
  "A팀 점수",
  "B팀 점수",
] as const;
export const OPTIONAL_IMPORT_HEADERS = ["시간", "코트명"] as const;
/** 시간 칸이 없거나 비었을 때 쓰는 시각(KST) */
export const DEFAULT_IMPORT_TIME = "12:00";

type ImportHeader =
  | (typeof REQUIRED_IMPORT_HEADERS)[number]
  | (typeof OPTIONAL_IMPORT_HEADERS)[number];

type ImportPlayer = Pick<AdminPlayer, "id" | "username" | "gender" | "status">;

export interface ImportedPreviewRow {
  /** 시트 행 번호(머리 행이 1) */
  sourceRowNumber: number;
  matchNumber: string;
  dateLabel: string;
  timeLabel: string;
  courtName: string;
  usernames: [string, string, string, string];
  inferredType: MatchType | null;
  scoreLabel: string;
  issues: string[];
  payload: AdminBatchMatchItemRequest | null;
}

export interface ImportedPreview {
  headerIssues: string[];
  rows: ImportedPreviewRow[];
  validMatches: AdminBatchMatchItemRequest[];
  errorCount: number;
}

const normalizeHeader = (value: string) => value.replace(/\s+/g, "");

/** 시트에서 복사한 마크다운 링크 "[아이디](url)"면 아이디만 */
export const normalizeImportedUsername = (value: string): string => {
  const trimmed = value.trim();
  const markdownLinkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  return markdownLinkMatch ? markdownLinkMatch[1].trim() : trimmed;
};

/** "H:mm"·"HH:mm"이면 시·분, 아니면 null */
export const parseImportedTime = (
  value: string,
): { hour: number; minute: number } | null => {
  const timeMatch = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

/** "2026년 11월 12일"(또는 Date가 읽는 날짜)과 KST 시각을 ISO 문자열로. 읽지 못하면 null */
export const parseImportedDateToIso = (
  value: string,
  time: { hour: number; minute: number },
): string | null => {
  const trimmed = value.trim();
  const koreanDateMatch = trimmed.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  let year: number;
  let monthIndex: number;
  let day: number;
  if (koreanDateMatch) {
    year = Number(koreanDateMatch[1]);
    monthIndex = Number(koreanDateMatch[2]) - 1;
    day = Number(koreanDateMatch[3]);
  } else {
    if (!trimmed) return null;
    const fallbackDate = new Date(trimmed);
    if (Number.isNaN(fallbackDate.getTime())) return null;
    year = fallbackDate.getFullYear();
    monthIndex = fallbackDate.getMonth();
    day = fallbackDate.getDate();
  }
  // KST(UTC+9) 벽시계 시각을 UTC로 옮긴다
  return new Date(
    Date.UTC(year, monthIndex, day, time.hour - 9, time.minute, 0),
  ).toISOString();
};

/** 성별로 정한 복식 분류. 성별을 모르는 선수가 끼면 무관 복식이다 */
const inferDoublesType = (
  teamA: readonly ImportPlayer[],
  teamB: readonly ImportPlayer[],
): MatchType => {
  const all = [...teamA, ...teamB];
  const isMixedTeam = (team: readonly ImportPlayer[]) =>
    team.some((player) => player.gender === "M") &&
    team.some((player) => player.gender === "F");
  if (isMixedTeam(teamA) && isMixedTeam(teamB)) return "mixed-doubles";
  if (all.every((player) => player.gender === "M")) return "men-doubles";
  if (all.every((player) => player.gender === "F")) return "women-doubles";
  return "unrestricted-doubles";
};

/**
 * 구글 시트에서 복사한 탭 구분 표를 복식 경기 요청으로 바꾼다.
 * 첫 줄은 머리이고, 필수 머리가 없으면 줄은 읽지 않는다. 빈 입력이면 null.
 */
export const buildImportedPreview = (
  rawText: string,
  players: readonly ImportPlayer[],
  location: string,
): ImportedPreview | null => {
  const lines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  const headers = lines[0].split("\t").map((header) => header.trim());
  const headerIndexByKey = new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
  const headerIssues = REQUIRED_IMPORT_HEADERS.filter(
    (header) => !headerIndexByKey.has(normalizeHeader(header)),
  ).map((header) => `필수 머리가 없어요: ${header}`);
  if (headerIssues.length > 0) {
    return { headerIssues, rows: [], validMatches: [], errorCount: headerIssues.length };
  }

  const getCell = (columns: string[], header: ImportHeader) =>
    columns[headerIndexByKey.get(normalizeHeader(header)) ?? -1]?.trim() ?? "";
  const playerByUsername = new Map(players.map((player) => [player.username, player]));

  const rows = lines.slice(1).map((line, rowIndex): ImportedPreviewRow => {
    const columns = line.split("\t");
    const matchNumber = getCell(columns, "경기번호");
    const dateLabel = getCell(columns, "날짜");
    const timeLabel = getCell(columns, "시간");
    const courtName = getCell(columns, "코트명");
    const usernames = [
      normalizeImportedUsername(getCell(columns, "A팀 선수1")),
      normalizeImportedUsername(getCell(columns, "A팀 선수2")),
      normalizeImportedUsername(getCell(columns, "B팀 선수1")),
      normalizeImportedUsername(getCell(columns, "B팀 선수2")),
    ] as [string, string, string, string];
    const scoreALabel = getCell(columns, "A팀 점수");
    const scoreBLabel = getCell(columns, "B팀 점수");
    const scoreA = parseLineupScore(scoreALabel);
    const scoreB = parseLineupScore(scoreBLabel);
    const issues: string[] = [];

    usernames.forEach((username, index) => {
      if (!username) {
        issues.push(`${index + 1}번째 선수 아이디가 비어 있어요.`);
        return;
      }
      const player = playerByUsername.get(username);
      if (!player) {
        issues.push(`없는 아이디예요: ${username}`);
      } else if (player.status !== "active") {
        issues.push(`비활성 회원이에요: ${username}`);
      }
    });

    const filledUsernames = usernames.filter(Boolean);
    if (new Set(filledUsernames).size !== filledUsernames.length) {
      issues.push("한 경기에 같은 선수가 두 번 있어요.");
    }

    if (scoreA === null || scoreB === null || scoreA === scoreB) {
      issues.push("점수가 올바르지 않아요.");
    }

    const parsedTime = parseImportedTime(timeLabel || DEFAULT_IMPORT_TIME);
    if (!parsedTime) {
      issues.push(`시간은 HH:mm 형식이어야 해요: ${timeLabel}`);
    }
    const matchStartsAt = parsedTime ? parseImportedDateToIso(dateLabel, parsedTime) : null;
    if (parsedTime && !matchStartsAt) {
      issues.push(`날짜를 읽지 못했어요: ${dateLabel || "(빈칸)"}`);
    }

    const participants = usernames.map((username) => playerByUsername.get(username));
    const resolved = participants.every(Boolean)
      ? (participants as ImportPlayer[])
      : null;
    const inferredType = resolved
      ? inferDoublesType(resolved.slice(0, 2), resolved.slice(2, 4))
      : null;

    const payload: AdminBatchMatchItemRequest | null =
      issues.length === 0 && resolved && inferredType && matchStartsAt && scoreA !== null && scoreB !== null
        ? {
            type: inferredType,
            teams: [
              { playerIds: resolved.slice(0, 2).map((player) => player.id) },
              { playerIds: resolved.slice(2, 4).map((player) => player.id) },
            ],
            location,
            ...(courtName && { courtName }),
            matchStartsAt,
            scores: [{ scoreA, scoreB }],
          }
        : null;

    return {
      sourceRowNumber: rowIndex + 2,
      matchNumber,
      dateLabel,
      timeLabel,
      courtName,
      usernames,
      inferredType,
      scoreLabel: `${scoreALabel || "–"} : ${scoreBLabel || "–"}`,
      issues,
      payload,
    };
  });

  return {
    headerIssues,
    rows,
    validMatches: rows
      .map((row) => row.payload)
      .filter((payload): payload is AdminBatchMatchItemRequest => payload !== null),
    errorCount: rows.reduce((count, row) => count + row.issues.length, 0),
  };
};
