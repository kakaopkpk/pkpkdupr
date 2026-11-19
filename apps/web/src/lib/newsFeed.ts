import type {
  NewsFeedLine,
  NewsFeedNewMemberItem,
  NewsFeedSessionItem,
} from "@pkpkdupr/shared/newsFeed";
import { type MatchSessionHistoryInfo, requestJson } from "@/lib/rankings";

/** JSON 응답 형태(날짜는 문자열) */
type AchievementLine = Extract<NewsFeedLine, { kind: "achievement" }>;

export type NewsFeedAchievementLineInfo = Omit<AchievementLine, "earnedAt"> & {
  earnedAt: string;
};

export type NewsFeedLineInfo =
  | NewsFeedAchievementLineInfo
  | Exclude<NewsFeedLine, { kind: "achievement" }>;

export type NewsFeedSessionItemInfo = Omit<
  NewsFeedSessionItem,
  "session" | "lines"
> & {
  session: MatchSessionHistoryInfo;
  lines: NewsFeedLineInfo[];
};

export type NewsFeedNewMemberItemInfo = Omit<
  NewsFeedNewMemberItem,
  "joinedAt"
> & {
  joinedAt: string;
};

export type NewsFeedItemInfo =
  | NewsFeedSessionItemInfo
  | NewsFeedNewMemberItemInfo;

export interface NewsFeedPageInfo {
  items: NewsFeedItemInfo[];
  nextCursor: string | null;
}

export const getNewsFeedItemKey = (item: NewsFeedItemInfo) =>
  item.kind === "session"
    ? `session:${item.session.id}`
    : `newMember:${item.player.id}`;

/** 홈 소식 피드 한 페이지. cursor가 없으면 첫 페이지 */
export const fetchNewsFeed = (cursor: string | null = null) =>
  requestJson<NewsFeedPageInfo>(
    `/api/news-feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    "소식을 불러오지 못했어요.",
  );
