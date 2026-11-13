import type {
  RecordMatchItem,
  RecordSessionItem,
  RecordsResponse,
} from "@pkpkdupr/shared/ranking";
import type { MatchInfo } from "@/types/match";
import { apiFetch } from "@/lib/api";
import { type MatchSessionHistoryInfo, RequestError } from "@/lib/rankings";

/** JSON 응답 형태(날짜는 문자열) */
export type RecordSessionItemInfo = Omit<RecordSessionItem, "session"> & {
  session: MatchSessionHistoryInfo;
};

export type RecordMatchItemInfo = Omit<RecordMatchItem, "match"> & {
  match: MatchInfo;
};

export type RecordItemInfo = RecordSessionItemInfo | RecordMatchItemInfo;

export type RecordsResponseInfo = Omit<RecordsResponse, "items"> & {
  items: RecordItemInfo[];
};

/** 기록 탭 목록 한 묶음. cursor는 이전 응답의 nextCursor를 그대로 넘긴다 */
export const fetchRecords = async (options: {
  limit: number;
  cursor?: string | null;
  playerId?: string;
}): Promise<RecordsResponseInfo> => {
  const params = new URLSearchParams({ limit: String(options.limit) });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.playerId) params.set("playerId", options.playerId);
  const res = await apiFetch(`/api/records?${params.toString()}`);
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new RequestError(
      errorData.error || "기록을 불러오지 못했어요.",
      res.status,
    );
  }
  return (await res.json()) as RecordsResponseInfo;
};

export const getRecordItemKey = (item: RecordItemInfo) =>
  item.kind === "session" ? `session:${item.session.id}` : `match:${item.match.id}`;

/** 날짜 제목 기준 시각: 세션은 session.date, 경기는 matchStartsAt */
export const getRecordItemDate = (item: RecordItemInfo) =>
  item.kind === "session" ? item.session.date : item.match.matchStartsAt;
