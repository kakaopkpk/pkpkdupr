// 사용자별 데이터를 담는 localStorage 캐시 키. 페이지의 읽기·쓰기와 삭제 코드가 같은 상수를 쓴다.
export const CACHED_MEMBERS_KEY = "pkpkdupr:members";
export const CACHED_MATCH_FEED_KEY = "pkpkdupr:matches:v3-session-feed";
export const CACHED_MY_MATCH_FEED_KEY = `${CACHED_MATCH_FEED_KEY}:my`;

const USER_CACHE_KEYS = [
  CACHED_MEMBERS_KEY,
  CACHED_MATCH_FEED_KEY,
  CACHED_MY_MATCH_FEED_KEY,
];

// 로그아웃·계정 전환 시 이전 사용자의 화면 데이터가 다음 사용자에게 보이지 않도록 지운다.
export const clearUserCaches = () => {
  for (const key of USER_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 저장소 접근이 막힌 환경에서는 지울 캐시도 없다.
    }
  }
};
