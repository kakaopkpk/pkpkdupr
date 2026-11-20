/**
 * 화면이 다시 받을지 정하는 데이터 종류. 화면이 아니라 데이터 기준으로 무효화한다.
 * - sessions: 세션·참여자·대회 순위
 * - matches: 경기(진행 중·예정·완료, 기록·수정·삭제)
 * - ratings: 평점·평점 이력·랭킹
 * - achievements: 업적
 * - players: 회원 정보(이름·사진·상태 메시지·활성)
 */
export type DataKind =
  | "sessions"
  | "matches"
  | "ratings"
  | "achievements"
  | "players";

export const DATA_KINDS: readonly DataKind[] = [
  "sessions",
  "matches",
  "ratings",
  "achievements",
  "players",
];

/** api가 쓰기 뒤 데이터 종류 변경 신호를 보내는 Supabase Realtime private 채널 topic */
export const DATA_SYNC_CHANNEL_TOPIC = "data-sync";
/** 변경 신호 broadcast 이벤트 이름 */
export const DATA_SYNC_CHANGED_EVENT = "changed";

/** 변경 신호 payload. 데이터·id는 싣지 않고 바뀐 종류만 알린다 */
export interface DataSyncChangedPayload {
  kinds: DataKind[];
}

const DATA_KIND_SET: ReadonlySet<string> = new Set(DATA_KINDS);

export const isDataKind = (value: unknown): value is DataKind =>
  typeof value === "string" && DATA_KIND_SET.has(value);
