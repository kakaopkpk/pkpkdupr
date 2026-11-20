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
