import {
  getDb,
  getDbClient,
  getDevMockUsernames,
  isDevMockDataEnabled,
  MatchRepository,
  OfficialDuprAdjustmentLogRepository,
  PlayerCreationLogRepository,
  PlayerRatingChangeLogRepository,
  PlayerRatingChartProjectionRepository,
  PlayerRepository,
  PlayerStatusChangeLogRepository,
  TestDataRepository,
} from "@pkpkdupr/db";

/**
 * api가 사용하는 저장소 인스턴스의 단일 생성 지점.
 * DB 연결 방식은 이 파일에서만 결정하고, 서비스·저장소 어댑터는 `db`만 참조한다.
 */
const drizzleDb = getDb();
const client = getDbClient();

const players = new PlayerRepository(drizzleDb);
const playerCreationLogs = new PlayerCreationLogRepository(drizzleDb);
const playerStatusChangeLogs = new PlayerStatusChangeLogRepository(drizzleDb);

export const db: {
  players: PlayerRepository;
  playerCreationLogs: PlayerCreationLogRepository;
  playerStatusChangeLogs: PlayerStatusChangeLogRepository;
  playerRatingChangeLogs: PlayerRatingChangeLogRepository;
  playerRatingChartProjections: PlayerRatingChartProjectionRepository;
  officialDuprAdjustmentLogs: OfficialDuprAdjustmentLogRepository;
  matches: MatchRepository;
  testData: TestDataRepository;
} = {
  players,
  playerCreationLogs,
  playerStatusChangeLogs,
  playerRatingChangeLogs: new PlayerRatingChangeLogRepository(drizzleDb),
  playerRatingChartProjections: new PlayerRatingChartProjectionRepository(
    client,
  ),
  officialDuprAdjustmentLogs: new OfficialDuprAdjustmentLogRepository(
    drizzleDb,
  ),
  matches: new MatchRepository(drizzleDb, client),
  testData: new TestDataRepository(
    drizzleDb,
    client,
    players,
    playerCreationLogs,
    playerStatusChangeLogs,
  ),
};

/**
 * (dev mock 활성 시) 시딩. 앱 시작 시 한 번 호출한다.
 * 스키마는 Supabase CLI가 supabase/migrations/를 적용해 준비하므로 여기서 만들지 않는다.
 */
export async function initDatabase(): Promise<void> {
  if (isDevMockDataEnabled()) {
    await db.testData.seedDevMockData();
    console.log(
      "[DB] Dev mock data seeded",
      getDevMockUsernames()
        .map(({ username, status }) => `${username}(${status})`)
        .join(", "),
    );
  }
}
