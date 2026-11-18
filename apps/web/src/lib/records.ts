import type {
  RecordMatchItem,
  RecordSessionItem,
} from "@pkpkdupr/shared/ranking";
import type { MatchInfo } from "@/types/match";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";

/** JSON 응답 형태(날짜는 문자열) */
export type RecordSessionItemInfo = Omit<RecordSessionItem, "session"> & {
  session: MatchSessionHistoryInfo;
};

export type RecordMatchItemInfo = Omit<RecordMatchItem, "match"> & {
  match: MatchInfo;
};

export type RecordItemInfo = RecordSessionItemInfo | RecordMatchItemInfo;

export const getRecordItemKey = (item: RecordItemInfo) =>
  item.kind === "session" ? `session:${item.session.id}` : `match:${item.match.id}`;

/** 기록 줄의 날짜 기준 시각: 세션은 session.date, 경기는 matchStartsAt */
export const getRecordItemDate = (item: RecordItemInfo) =>
  item.kind === "session" ? item.session.date : item.match.matchStartsAt;
