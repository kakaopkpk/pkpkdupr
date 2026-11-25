import type {
  PendingSessionPraisesResponse,
  SessionPraiseCandidate,
  SessionPraiseCategory,
  SessionPraiseRequest,
  SessionPraiseResponse,
} from "@pkpkdupr/shared/sessionPraise";
import { formatRatingDelta } from "@/lib/format";
import { requestJson } from "@/lib/rankings";

const praisePath = (sessionId: string) =>
  `/api/match-sessions/${encodeURIComponent(sessionId)}/praise`;

export const fetchSessionPraise = (sessionId: string) =>
  requestJson<SessionPraiseResponse>(
    praisePath(sessionId),
    "칭찬을 불러오지 못했어요.",
  );

/** 팝업으로 띄울 칭찬 세션(끝난 시각 최신순) */
export const fetchPendingSessionPraises = () =>
  requestJson<PendingSessionPraisesResponse>(
    "/api/me/session-praises/pending",
    "칭찬할 세션을 불러오지 못했어요.",
  );

/** 칭찬을 보내고 저장이 반영된 칭찬 상태를 받는다. 후보가 아니면 400, 마감·이미 칭찬이면 409 */
export const praiseSessionPlayer = (
  sessionId: string,
  targetPlayerId: string,
): Promise<SessionPraiseResponse> => {
  const body: SessionPraiseRequest = { targetPlayerId };
  return requestJson<SessionPraiseResponse>(
    praisePath(sessionId),
    "칭찬하지 못했어요.",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
};

/**
 * 칭찬 분류의 한 줄 값(세션 상세·홈 소식·세션 요약 공유 이미지).
 * "+0.106 상승"·"11연승 저지"·"연승 저지 2회"·"순위 상승 ▲9"·"5승"·"58점 득점"·"듀스 2승"·"+0.25 강팀 격파"·"리벤지 성공 1회"
 */
export const formatSessionPraiseValue = (
  category: SessionPraiseCategory,
  value: number,
  /** 연승 수문장의 저지 횟수(`SessionPraiseCandidate.streakBreaks`) */
  streakBreaks = 1,
): string => {
  switch (category) {
    case "dominator":
      return `${formatRatingDelta(value)} 상승`;
    case "streakGuard":
      return streakBreaks >= 2 ? `연승 저지 ${streakBreaks}회` : `${value}연승 저지`;
    case "rankJump":
      return `순위 상승 ▲${value}`;
    case "mostWins":
      return `${value}승`;
    case "mostPoints":
      return `${value}점 득점`;
    case "clutch":
      return `듀스 ${value}승`;
    case "underdog":
      return `+${value.toFixed(2)} 강팀 격파`;
    case "revenge":
      return `리벤지 성공 ${value}회`;
  }
};

/** 칭찬 팝업 카드의 큰 값과 그 아래 설명 줄: "11연승"/"저지"·"2회"/"연승 저지"·"+0.33"/"강팀 격파" 등 */
export const getSessionPraiseCardValue = ({
  category,
  value,
  streakBreaks = 1,
}: Pick<SessionPraiseCandidate, "category" | "value" | "streakBreaks">): {
  main: string;
  caption: string;
} => {
  switch (category) {
    case "dominator":
      return { main: formatRatingDelta(value), caption: "상승" };
    case "streakGuard":
      return streakBreaks >= 2
        ? { main: `${streakBreaks}회`, caption: "연승 저지" }
        : { main: `${value}연승`, caption: "저지" };
    case "rankJump":
      return { main: `▲${value}`, caption: "순위 상승" };
    case "mostWins":
      return { main: `${value}승`, caption: "승리" };
    case "mostPoints":
      return { main: `${value}점`, caption: "득점" };
    case "clutch":
      return { main: `${value}승`, caption: "듀스 승리" };
    case "underdog":
      return { main: `+${value.toFixed(2)}`, caption: "강팀 격파" };
    case "revenge":
      return { main: `${value}회`, caption: "리벤지 성공" };
  }
};

/**
 * 세션 상세 칭찬 알약 상태.
 * - open: 칭찬 전(누를 수 있음)
 * - picked: 내가 칭찬한 후보
 * - inactive: 칭찬한 뒤 나머지 후보, 마감 뒤 칭찬하지 않았으면 모든 후보(누를 수 없음)
 */
export type SessionPraisePillState = "open" | "picked" | "inactive";

export const getSessionPraisePillState = (
  praise: Pick<SessionPraiseResponse, "status" | "myTargetPlayerId">,
  candidatePlayerId: string,
): SessionPraisePillState => {
  if (praise.myTargetPlayerId) {
    return praise.myTargetPlayerId === candidatePlayerId ? "picked" : "inactive";
  }
  return praise.status === "open" ? "open" : "inactive";
};

/** 칭찬 팝업을 넘긴(칭찬하지 않고 닫은) 세션. 회원 id + 세션 id로 기억해 다시 띄우지 않는다 */
const SKIPPED_STORAGE_KEY = "pkpkdupr:session-praise-skipped";
/** 마감(1시간)이 지난 세션은 다시 뜨지 않으므로 최근 것만 남긴다 */
const SKIPPED_MAX_COUNT = 30;

export const getSkippedSessionPraiseKey = (playerId: string, sessionId: string) =>
  `${playerId}:${sessionId}`;

/** 저장된 값을 읽는다. 형식이 깨졌으면 빈 목록 */
export const parseSkippedSessionPraises = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

/** 넘긴 세션을 맨 뒤에 더하고 오래된 것부터 SKIPPED_MAX_COUNT개만 남긴다 */
export const addSkippedSessionPraise = (
  skipped: readonly string[],
  key: string,
): string[] =>
  [...skipped.filter((value) => value !== key), key].slice(-SKIPPED_MAX_COUNT);

export const readSkippedSessionPraises = (): string[] => {
  try {
    return parseSkippedSessionPraises(localStorage.getItem(SKIPPED_STORAGE_KEY));
  } catch {
    return [];
  }
};

export const rememberSkippedSessionPraise = (playerId: string, sessionId: string) => {
  try {
    localStorage.setItem(
      SKIPPED_STORAGE_KEY,
      JSON.stringify(
        addSkippedSessionPraise(
          readSkippedSessionPraises(),
          getSkippedSessionPraiseKey(playerId, sessionId),
        ),
      ),
    );
  } catch {
    // 저장소를 쓸 수 없으면 이번 실행 동안만 넘긴다
  }
};

/** 팝업으로 띄울 첫 세션: 넘기지 않은 세션(후보 2명 이상인 세션만 서버가 준다) */
export const pickPendingSessionPraise = (
  items: readonly SessionPraiseResponse[],
  playerId: string,
  skipped: readonly string[],
): SessionPraiseResponse | null =>
  items.find(
    (item) =>
      !skipped.includes(getSkippedSessionPraiseKey(playerId, item.session.id)),
  ) ?? null;
