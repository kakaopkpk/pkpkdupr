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
  /** 이 프로세스에서 마지막으로 줄 선 run이 끝나면 resolve된다(reject되지 않는다) */
  private queueTail: Promise<void> = Promise.resolve();

  constructor(private readonly client: DbClient) {}

  /**
   * DB 잠금 대기는 풀 커넥션을 하나씩 점유하므로, 대기자가 풀 크기만큼 쌓이면 잠금 보유자의
   * fn이 커넥션을 얻지 못해 교착된다. 그래서 같은 프로세스 안에서는 먼저 줄을 세워
   * 한 번에 하나의 run만 DB 잠금을 잡게 하고, DB 잠금은 프로세스(Edge 인스턴스) 사이 직렬화를 맡는다.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queueTail;
    let release!: () => void;
    this.queueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.client.withAdvisoryXactLock(RATING_WRITE_LOCK_KEY, fn);
    } finally {
      release();
    }
  }
}
