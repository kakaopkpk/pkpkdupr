// 화면끼리 필터·선택을 넘기는 링크는 반드시 이 함수로 만들고, 받는 화면은 parse*로 읽는다.
// 쿼리 키(고정):
//   /members  kind, firstLogin=1, player, add=1
//   /matches  tab=deleted|edited, session, noSession=1, match
//   /sessions session, month
//   /ratings  player

export type MemberKindFilter = "all" | "member" | "guest" | "inactive";

export interface MembersRouteParams {
  kind?: MemberKindFilter;
  firstLogin?: boolean;
  playerId?: string;
  add?: boolean;
}

export interface MatchesRouteParams {
  tab?: "list" | "deleted" | "edited";
  sessionId?: string;
  noSession?: boolean;
  matchId?: string;
}

export interface SessionsRouteParams {
  sessionId?: string;
  /** "YYYY-MM" */
  month?: string;
}

export interface RatingsRouteParams {
  playerId?: string;
}

const MEMBER_KINDS: readonly MemberKindFilter[] = [
  "all",
  "member",
  "guest",
  "inactive",
];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const buildPath = (
  pathname: string,
  entries: Array<[string, string | undefined | false]>,
) => {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
};

const readString = (search: URLSearchParams, key: string) =>
  search.get(key) || undefined;

const readFlag = (search: URLSearchParams, key: string) =>
  search.get(key) === "1" ? true : undefined;

export const homePath = (): string => "/";

export const membersPath = (params: MembersRouteParams = {}): string =>
  buildPath("/members", [
    // "all"은 기본값이라 쿼리에 남기지 않는다
    ["kind", params.kind !== "all" && params.kind],
    ["firstLogin", params.firstLogin && "1"],
    ["player", params.playerId],
    ["add", params.add && "1"],
  ]);

export const matchesPath = (params: MatchesRouteParams = {}): string =>
  buildPath("/matches", [
    ["tab", params.tab !== "list" && params.tab],
    ["session", params.sessionId],
    ["noSession", params.noSession && "1"],
    ["match", params.matchId],
  ]);

export const sessionsPath = (params: SessionsRouteParams = {}): string =>
  buildPath("/sessions", [
    ["session", params.sessionId],
    ["month", params.month],
  ]);

export const ratingsPath = (params: RatingsRouteParams = {}): string =>
  buildPath("/ratings", [["player", params.playerId]]);

export const parseMembersParams = (
  search: URLSearchParams,
): MembersRouteParams => {
  const kind = search.get("kind");
  return {
    kind: MEMBER_KINDS.includes(kind as MemberKindFilter)
      ? (kind as MemberKindFilter)
      : undefined,
    firstLogin: readFlag(search, "firstLogin"),
    playerId: readString(search, "player"),
    add: readFlag(search, "add"),
  };
};

const MATCHES_TABS = ["deleted", "edited"] as const;

export const parseMatchesParams = (
  search: URLSearchParams,
): MatchesRouteParams => ({
  tab: MATCHES_TABS.find((tab) => tab === search.get("tab")),
  sessionId: readString(search, "session"),
  noSession: readFlag(search, "noSession"),
  matchId: readString(search, "match"),
});

export const parseSessionsParams = (
  search: URLSearchParams,
): SessionsRouteParams => {
  const month = search.get("month");
  return {
    sessionId: readString(search, "session"),
    month: month && MONTH_PATTERN.test(month) ? month : undefined,
  };
};

export const parseRatingsParams = (
  search: URLSearchParams,
): RatingsRouteParams => ({
  playerId: readString(search, "player"),
});
