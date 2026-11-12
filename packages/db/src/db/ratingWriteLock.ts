import type { DbClient } from "./client";

/**
 * 평점 쓰기 잠금 키. 평점·평점 변경 로그를 쓰는 모든 경로가 이 키 하나로 직렬화된다.
 * 동호회 규모라 경로별로 나누지 않는다.
 */
export const RATING_WRITE_LOCK_KEY = 180_001;

/**
 * 평점 쓰기 경로(증분 반영·전체 재계산·공식 DUPR 조정·삭제 후 재계산)를 하나씩 실행한다.
 * 재계산 입력(완료 경기 목록)은 반드시 run 안에서 읽어야 다른 경로가 먼저 반영한 경기를 덮어쓰지 않는다.
 */
export class RatingWriteLock {
  constructor(private readonly client: DbClient) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return await this.client.withAdvisoryXactLock(RATING_WRITE_LOCK_KEY, fn);
  }
}
