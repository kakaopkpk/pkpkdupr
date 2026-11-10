import type { PlayerDupr } from "@pkpkdupr/shared/player";
import { and, eq } from "drizzle-orm";
import {
  matchParticipants,
  matchResultApprovals,
  matchSessions,
  matches,
  matchScores,
  playerCreationLogs,
  playerRatingChangeLogs,
  playerStatusChangeLogs,
} from "../db/schema";
import type { CreatePlayerCreationLogInput } from "./PlayerCreationLogRepository";
import { PlayerCreationLogRepository } from "./PlayerCreationLogRepository";
import type { CreatePlayerStatusChangeLogInput } from "./PlayerStatusChangeLogRepository";
import { PlayerStatusChangeLogRepository } from "./PlayerStatusChangeLogRepository";
import type { CreateStoredPlayerInput } from "./PlayerRepository";
import { PlayerRepository } from "./PlayerRepository";

const DEV_PASSWORD_HASH =
  "$2b$10$YwUchh/fxRAeCFxtLM5QW.YsBqK3BvgFBkEM2AxPHaaNnpaB62aEW"; // dev1234
const TEST_PASSWORD_HASH =
  "$2b$10$GISrPxsWRYCfWRrsnRBbu.iTuxCX6hsJ4UiKDmqVNmSYahHTK1hQq"; // test123qwe

const createDupr = (seed: number): PlayerDupr => ({
  singles: seed - 0.013,
  doubles: seed + 0.004,
});

const devPlayerIdByLegacyId: Record<string, string> = {
  "dev-player-alice": "Pdev0001",
  "dev-player-bob": "Pdev0002",
  "dev-player-cara": "Pdev0003",
  "dev-player-dana": "Pdev0004",
  "dev-player-ella": "Pdev0005",
  "dev-player-finn": "Pdev0006",
  "dev-player-gabe": "Pdev0007",
  "dev-player-hugo": "Pdev0008",
  "dev-player-chris": "Pdev0009",
};

const devMatchIdByLegacyId: Record<string, string> = {
  "dev-match-open-play-001": "Mdev0001",
  "dev-match-ladder-002": "Mdev0002",
  "dev-session-open-play-001": "Mdev0003",
  "dev-session-open-play-002": "Mdev0004",
  "dev-session-open-play-003": "Mdev0005",
  "dev-session-scheduled-001": "Mdev0008",
  "dev-session-scheduled-002": "Mdev0009",
  "dev-session-scheduled-003": "Mdev0010",
  "dev-match-missing-opponent-004": "Mdev0006",
  "dev-match-without-players-005": "Mdev0007",
};

const toDevPlayerId = (id: string) => devPlayerIdByLegacyId[id] ?? id;
const toDevMatchId = (id: string) => devMatchIdByLegacyId[id] ?? id;
const DEV_OPEN_PLAY_SESSION_ID = "Sdev0001";
const DEV_SCHEDULED_SESSION_ID = "Sdev0002";

const devMockPlayerReferenceColumns = [
  ["player_creation_logs", "player_id"],
  ["player_creation_logs", "created_by_player_id"],
  ["player_status_change_logs", "player_id"],
  ["player_status_change_logs", "changed_by_player_id"],
  ["player_rating_change_logs", "player_id"],
  ["official_dupr_adjustment_logs", "player_id"],
  ["official_dupr_adjustment_logs", "changed_by_player_id"],
  ["matches", "creator_player_id"],
  ["matches", "result_submitted_by_player_id"],
] as const;

const mockPlayers: CreateStoredPlayerInput[] = [
  {
    id: "dev-player-alice",
    username: "dev_alice",
    gender: "F",
    status: "active",
    duprRating: createDupr(3.62),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-01T09:00:00+09:00"),
    updatedAt: new Date("2026-06-01T09:00:00+09:00"),
  },
  {
    id: "dev-player-bob",
    username: "dev_bob",
    gender: "M",
    status: "active",
    duprRating: createDupr(4.11),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T10:30:00+09:00"),
    updatedAt: new Date("2026-06-02T10:30:00+09:00"),
  },
  {
    id: "dev-player-cara",
    username: "dev_cara",
    gender: "F",
    status: "active",
    duprRating: createDupr(3.49),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T11:00:00+09:00"),
    updatedAt: new Date("2026-06-02T11:00:00+09:00"),
  },
  {
    id: "dev-player-dana",
    username: "dev_dana",
    gender: "F",
    status: "active",
    duprRating: createDupr(3.77),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T11:30:00+09:00"),
    updatedAt: new Date("2026-06-02T11:30:00+09:00"),
  },
  {
    id: "dev-player-ella",
    username: "dev_ella",
    gender: "F",
    status: "active",
    duprRating: createDupr(3.92),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T12:00:00+09:00"),
    updatedAt: new Date("2026-06-02T12:00:00+09:00"),
  },
  {
    id: "dev-player-finn",
    username: "dev_finn",
    gender: "M",
    status: "active",
    duprRating: createDupr(4.05),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T12:30:00+09:00"),
    updatedAt: new Date("2026-06-02T12:30:00+09:00"),
  },
  {
    id: "dev-player-gabe",
    username: "dev_gabe",
    gender: "M",
    status: "active",
    duprRating: createDupr(3.86),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T13:00:00+09:00"),
    updatedAt: new Date("2026-06-02T13:00:00+09:00"),
  },
  {
    id: "dev-player-hugo",
    username: "dev_hugo",
    gender: "M",
    status: "active",
    duprRating: createDupr(4.21),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-02T13:30:00+09:00"),
    updatedAt: new Date("2026-06-02T13:30:00+09:00"),
  },
  {
    id: "dev-player-chris",
    username: "dev_chris_inactive",
    gender: "M",
    status: "inactive",
    duprRating: createDupr(2.98),
    passwordHash: DEV_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-06-03T14:15:00+09:00"),
    updatedAt: new Date("2026-06-04T08:45:00+09:00"),
  },
  {
    id: "Ptest001",
    username: "test1",
    gender: "F",
    status: "active",
    affiliations: [{ name: "Gangnam Club", isPrimary: true }],
    duprRating: createDupr(3.176),
    passwordHash: TEST_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-07-20T09:00:00+09:00"),
    updatedAt: new Date("2026-07-21T19:10:00+09:00"),
  },
  {
    id: "Ptest002",
    username: "test2",
    gender: "M",
    status: "active",
    affiliations: [
      { name: "Jamsil Club", isPrimary: true },
      { name: "Weekend Pickleball Club", isPrimary: false },
    ],
    duprRating: createDupr(3.482),
    passwordHash: TEST_PASSWORD_HASH,
    isFirstLogin: false,
    createdAt: new Date("2026-07-18T09:00:00+09:00"),
    updatedAt: new Date("2026-07-22T20:15:00+09:00"),
  },
];

const mockCreationLogs: CreatePlayerCreationLogInput[] = mockPlayers.map(
  (player) => ({
    id: `dev-creation-log-${player.id}`,
    playerId: player.id,
    createdByPlayerId: null,
    createdByUsername: "dev-seed",
    creationSource: "admin_register",
    createdAt: player.createdAt,
  }),
);

const mockStatusLogs: CreatePlayerStatusChangeLogInput[] = [
  {
    id: "dev-status-log-chris-inactive",
    playerId: "dev-player-chris",
    previousStatus: "active",
    nextStatus: "inactive",
    changedByPlayerId: "dev-player-alice",
    changedByUsername: "dev-seed",
    changedAt: new Date("2026-06-04T08:45:00+09:00"),
  },
];

const mockMatches = [
  {
    id: "dev-match-open-play-001",
    type: "mixed-doubles",
    source: "player_created",
    creatorPlayerId: "dev-player-alice",
    status: "completed",
    location: "Dev Court A",
    matchStartsAt: new Date("2026-06-05T19:00:00+09:00"),
    completedAt: new Date("2026-06-05T20:10:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-alice",
    resultSubmittedAt: new Date("2026-06-05T20:05:00+09:00"),
    createdAt: new Date("2026-06-05T18:00:00+09:00"),
    updatedAt: new Date("2026-06-05T20:10:00+09:00"),
  },
  {
    id: "dev-match-ladder-002",
    type: "singles",
    source: "player_created",
    creatorPlayerId: "dev-player-alice",
    status: "created",
    location: "Dev Court B",
    matchStartsAt: new Date("2026-06-07T09:30:00+09:00"),
    completedAt: null,
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    createdAt: new Date("2026-06-06T13:20:00+09:00"),
    updatedAt: new Date("2026-06-06T13:20:00+09:00"),
  },
  {
    id: "dev-session-open-play-001",
    type: "mixed-doubles",
    source: "admin_created_result",
    creatorPlayerId: "dev-player-alice",
    sessionId: DEV_OPEN_PLAY_SESSION_ID,
    sessionName: "일요일 오픈 플레이",
    sessionDate: new Date("2026-07-19T09:00:00+09:00"),
    status: "completed",
    location: "Dev Court A",
    matchStartsAt: new Date("2026-07-19T09:00:00+09:00"),
    completedAt: new Date("2026-07-19T09:25:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-alice",
    resultSubmittedAt: new Date("2026-07-19T09:25:00+09:00"),
    createdAt: new Date("2026-07-19T08:40:00+09:00"),
    updatedAt: new Date("2026-07-19T09:25:00+09:00"),
  },
  {
    id: "dev-session-open-play-002",
    type: "mixed-doubles",
    source: "admin_created_result",
    creatorPlayerId: "dev-player-bob",
    sessionId: DEV_OPEN_PLAY_SESSION_ID,
    sessionName: "일요일 오픈 플레이",
    sessionDate: new Date("2026-07-19T09:00:00+09:00"),
    status: "completed",
    location: "Dev Court B",
    matchStartsAt: new Date("2026-07-19T09:35:00+09:00"),
    completedAt: new Date("2026-07-19T10:00:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-bob",
    resultSubmittedAt: new Date("2026-07-19T10:00:00+09:00"),
    createdAt: new Date("2026-07-19T08:41:00+09:00"),
    updatedAt: new Date("2026-07-19T10:00:00+09:00"),
  },
  {
    id: "dev-session-open-play-003",
    type: "mixed-doubles",
    source: "admin_created_result",
    creatorPlayerId: "dev-player-alice",
    sessionId: DEV_OPEN_PLAY_SESSION_ID,
    sessionName: "일요일 오픈 플레이",
    sessionDate: new Date("2026-07-19T09:00:00+09:00"),
    status: "completed",
    location: "Dev Court C",
    matchStartsAt: new Date("2026-07-19T10:10:00+09:00"),
    completedAt: new Date("2026-07-19T10:35:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-alice",
    resultSubmittedAt: new Date("2026-07-19T10:35:00+09:00"),
    createdAt: new Date("2026-07-19T08:42:00+09:00"),
    updatedAt: new Date("2026-07-19T10:35:00+09:00"),
  },
  {
    id: "dev-session-scheduled-001",
    type: "mixed-doubles",
    source: "admin_created",
    creatorPlayerId: "dev-player-alice",
    sessionId: DEV_SCHEDULED_SESSION_ID,
    sessionName: "시간 분리 검증 세션",
    sessionDate: new Date("2026-08-01T18:00:00+09:00"),
    status: "created",
    location: "Dev Court Schedule",
    courtName: "코트 1",
    matchStartsAt: new Date("2026-08-01T18:00:00+09:00"),
    completedAt: null,
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    createdAt: new Date("2026-07-30T09:00:00+09:00"),
    updatedAt: new Date("2026-07-30T09:00:00+09:00"),
  },
  {
    id: "dev-session-scheduled-002",
    type: "mixed-doubles",
    source: "admin_created",
    creatorPlayerId: "dev-player-bob",
    sessionId: DEV_SCHEDULED_SESSION_ID,
    sessionName: "시간 분리 검증 세션",
    sessionDate: new Date("2026-08-01T18:00:00+09:00"),
    status: "created",
    location: "Dev Court Schedule",
    courtName: "코트 1",
    matchStartsAt: new Date("2026-08-01T18:35:00+09:00"),
    completedAt: null,
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    createdAt: new Date("2026-07-30T09:01:00+09:00"),
    updatedAt: new Date("2026-07-30T09:01:00+09:00"),
  },
  {
    id: "dev-session-scheduled-003",
    type: "mixed-doubles",
    source: "admin_created",
    creatorPlayerId: "dev-player-cara",
    sessionId: DEV_SCHEDULED_SESSION_ID,
    sessionName: "시간 분리 검증 세션",
    sessionDate: new Date("2026-08-01T18:00:00+09:00"),
    status: "created",
    location: "Dev Court Schedule",
    courtName: "코트 2",
    matchStartsAt: new Date("2026-08-01T19:10:00+09:00"),
    completedAt: null,
    resultSubmittedByPlayerId: null,
    resultSubmittedAt: null,
    createdAt: new Date("2026-07-30T09:02:00+09:00"),
    updatedAt: new Date("2026-07-30T09:02:00+09:00"),
  },
  {
    id: "dev-match-missing-opponent-004",
    type: "singles",
    source: "player_created",
    creatorPlayerId: "dev-player-alice",
    status: "completed",
    location: "Dev Court Singles A",
    matchStartsAt: new Date("2026-07-30T18:00:00+09:00"),
    completedAt: new Date("2026-07-30T18:20:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-alice",
    resultSubmittedAt: new Date("2026-07-30T18:20:00+09:00"),
    createdAt: new Date("2026-07-30T17:30:00+09:00"),
    updatedAt: new Date("2026-07-30T18:20:00+09:00"),
  },
  {
    id: "dev-match-without-players-005",
    type: "singles",
    source: "player_created",
    creatorPlayerId: "dev-player-alice",
    status: "completed",
    location: "Dev Court Singles B",
    matchStartsAt: new Date("2026-07-30T19:00:00+09:00"),
    completedAt: new Date("2026-07-30T19:20:00+09:00"),
    resultSubmittedByPlayerId: "dev-player-alice",
    resultSubmittedAt: new Date("2026-07-30T19:20:00+09:00"),
    createdAt: new Date("2026-07-30T18:30:00+09:00"),
    updatedAt: new Date("2026-07-30T19:20:00+09:00"),
  },
  {
    id: "Mtest001",
    type: "mixed-doubles",
    source: "player_created",
    creatorPlayerId: "Ptest001",
    status: "completed",
    location: "Dev Court A",
    matchStartsAt: new Date("2026-07-21T18:30:00+09:00"),
    completedAt: new Date("2026-07-21T19:10:00+09:00"),
    resultSubmittedByPlayerId: "Ptest001",
    resultSubmittedAt: new Date("2026-07-21T19:10:00+09:00"),
    createdAt: new Date("2026-07-21T18:00:00+09:00"),
    updatedAt: new Date("2026-07-21T19:10:00+09:00"),
  },
  {
    id: "Mtest002",
    type: "mixed-doubles",
    source: "player_created",
    creatorPlayerId: "Ptest002",
    status: "completed",
    location: "Dev Court B",
    matchStartsAt: new Date("2026-07-20T19:00:00+09:00"),
    completedAt: new Date("2026-07-20T19:45:00+09:00"),
    resultSubmittedByPlayerId: "Ptest002",
    resultSubmittedAt: new Date("2026-07-20T19:45:00+09:00"),
    createdAt: new Date("2026-07-20T18:30:00+09:00"),
    updatedAt: new Date("2026-07-20T19:45:00+09:00"),
  },
  {
    id: "Mtest003",
    type: "mixed-doubles",
    source: "player_created",
    creatorPlayerId: "Ptest002",
    status: "completed",
    location: "Dev Court C",
    matchStartsAt: new Date("2026-07-22T19:30:00+09:00"),
    completedAt: new Date("2026-07-22T20:15:00+09:00"),
    resultSubmittedByPlayerId: "Ptest002",
    resultSubmittedAt: new Date("2026-07-22T20:15:00+09:00"),
    createdAt: new Date("2026-07-22T19:00:00+09:00"),
    updatedAt: new Date("2026-07-22T20:15:00+09:00"),
  },
];

const mockMatchScores = [
  {
    id: "dev-match-score-open-play-001-game-1",
    matchId: "dev-match-open-play-001",
    scoreA: 11,
    scoreB: 8,
  },
  {
    id: "dev-match-score-open-play-001-game-2",
    matchId: "dev-match-open-play-001",
    scoreA: 11,
    scoreB: 6,
  },
  {
    id: "dev-session-open-play-001-game-1",
    matchId: "dev-session-open-play-001",
    scoreA: 11,
    scoreB: 7,
  },
  {
    id: "dev-session-open-play-002-game-1",
    matchId: "dev-session-open-play-002",
    scoreA: 8,
    scoreB: 11,
  },
  {
    id: "dev-session-open-play-003-game-1",
    matchId: "dev-session-open-play-003",
    scoreA: 11,
    scoreB: 9,
  },
  {
    id: "Mtest001-score-1",
    matchId: "Mtest001",
    scoreA: 11,
    scoreB: 8,
  },
  {
    id: "Mtest002-score-1",
    matchId: "Mtest002",
    scoreA: 11,
    scoreB: 9,
  },
  {
    id: "Mtest003-score-1",
    matchId: "Mtest003",
    scoreA: 8,
    scoreB: 11,
  },
  {
    id: "dev-match-missing-opponent-004-score-1",
    matchId: "dev-match-missing-opponent-004",
    scoreA: 11,
    scoreB: 8,
  },
  {
    id: "dev-match-without-players-005-score-1",
    matchId: "dev-match-without-players-005",
    scoreA: 11,
    scoreB: 8,
  },
];

const mockMatchParticipants = [
  {
    id: "dev-match-open-play-001-team-0-alice",
    matchId: "dev-match-open-play-001",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-match-open-play-001-team-0-bob",
    matchId: "dev-match-open-play-001",
    teamIndex: 0,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-match-open-play-001-team-1-cara",
    matchId: "dev-match-open-play-001",
    teamIndex: 1,
    playerId: "dev-player-cara",
  },
  {
    id: "dev-match-open-play-001-team-1-finn",
    matchId: "dev-match-open-play-001",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "dev-match-ladder-002-team-0-alice",
    matchId: "dev-match-ladder-002",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-match-ladder-002-team-1-hugo",
    matchId: "dev-match-ladder-002",
    teamIndex: 1,
    playerId: "dev-player-hugo",
  },
  {
    id: "dev-session-open-play-001-team-0-alice",
    matchId: "dev-session-open-play-001",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-session-open-play-001-team-0-bob",
    matchId: "dev-session-open-play-001",
    teamIndex: 0,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-session-open-play-001-team-1-cara",
    matchId: "dev-session-open-play-001",
    teamIndex: 1,
    playerId: "dev-player-cara",
  },
  {
    id: "dev-session-open-play-001-team-1-finn",
    matchId: "dev-session-open-play-001",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "dev-session-open-play-002-team-0-bob",
    matchId: "dev-session-open-play-002",
    teamIndex: 0,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-session-open-play-002-team-0-gabe",
    matchId: "dev-session-open-play-002",
    teamIndex: 0,
    playerId: "dev-player-gabe",
  },
  {
    id: "dev-session-open-play-002-team-1-dana",
    matchId: "dev-session-open-play-002",
    teamIndex: 1,
    playerId: "dev-player-dana",
  },
  {
    id: "dev-session-open-play-002-team-1-hugo",
    matchId: "dev-session-open-play-002",
    teamIndex: 1,
    playerId: "dev-player-hugo",
  },
  {
    id: "dev-session-open-play-003-team-0-alice",
    matchId: "dev-session-open-play-003",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-session-open-play-003-team-0-ella",
    matchId: "dev-session-open-play-003",
    teamIndex: 0,
    playerId: "dev-player-ella",
  },
  {
    id: "dev-session-open-play-003-team-1-finn",
    matchId: "dev-session-open-play-003",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "dev-session-open-play-003-team-1-gabe",
    matchId: "dev-session-open-play-003",
    teamIndex: 1,
    playerId: "dev-player-gabe",
  },
  {
    id: "dev-session-scheduled-001-team-0-alice",
    matchId: "dev-session-scheduled-001",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-session-scheduled-001-team-0-bob",
    matchId: "dev-session-scheduled-001",
    teamIndex: 0,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-session-scheduled-001-team-1-cara",
    matchId: "dev-session-scheduled-001",
    teamIndex: 1,
    playerId: "dev-player-cara",
  },
  {
    id: "dev-session-scheduled-001-team-1-finn",
    matchId: "dev-session-scheduled-001",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "dev-session-scheduled-002-team-0-bob",
    matchId: "dev-session-scheduled-002",
    teamIndex: 0,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-session-scheduled-002-team-0-gabe",
    matchId: "dev-session-scheduled-002",
    teamIndex: 0,
    playerId: "dev-player-gabe",
  },
  {
    id: "dev-session-scheduled-002-team-1-dana",
    matchId: "dev-session-scheduled-002",
    teamIndex: 1,
    playerId: "dev-player-dana",
  },
  {
    id: "dev-session-scheduled-002-team-1-hugo",
    matchId: "dev-session-scheduled-002",
    teamIndex: 1,
    playerId: "dev-player-hugo",
  },
  {
    id: "dev-session-scheduled-003-team-0-alice",
    matchId: "dev-session-scheduled-003",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-session-scheduled-003-team-0-ella",
    matchId: "dev-session-scheduled-003",
    teamIndex: 0,
    playerId: "dev-player-ella",
  },
  {
    id: "dev-session-scheduled-003-team-1-finn",
    matchId: "dev-session-scheduled-003",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "dev-session-scheduled-003-team-1-gabe",
    matchId: "dev-session-scheduled-003",
    teamIndex: 1,
    playerId: "dev-player-gabe",
  },
  {
    id: "dev-match-missing-opponent-004-team-0-alice",
    matchId: "dev-match-missing-opponent-004",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-match-missing-opponent-004-team-1-bob",
    matchId: "dev-match-missing-opponent-004",
    teamIndex: 1,
    playerId: "dev-player-bob",
  },
  {
    id: "dev-match-without-players-005-team-0-alice",
    matchId: "dev-match-without-players-005",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "dev-match-without-players-005-team-1-bob",
    matchId: "dev-match-without-players-005",
    teamIndex: 1,
    playerId: "dev-player-bob",
  },
  {
    id: "Mtest001-team-0-Ptest001",
    matchId: "Mtest001",
    teamIndex: 0,
    playerId: "Ptest001",
  },
  {
    id: "Mtest001-team-0-alice",
    matchId: "Mtest001",
    teamIndex: 0,
    playerId: "dev-player-alice",
  },
  {
    id: "Mtest001-team-1-bob",
    matchId: "Mtest001",
    teamIndex: 1,
    playerId: "dev-player-bob",
  },
  {
    id: "Mtest001-team-1-cara",
    matchId: "Mtest001",
    teamIndex: 1,
    playerId: "dev-player-cara",
  },
  {
    id: "Mtest002-team-0-Ptest002",
    matchId: "Mtest002",
    teamIndex: 0,
    playerId: "Ptest002",
  },
  {
    id: "Mtest002-team-0-dana",
    matchId: "Mtest002",
    teamIndex: 0,
    playerId: "dev-player-dana",
  },
  {
    id: "Mtest002-team-1-finn",
    matchId: "Mtest002",
    teamIndex: 1,
    playerId: "dev-player-finn",
  },
  {
    id: "Mtest002-team-1-hugo",
    matchId: "Mtest002",
    teamIndex: 1,
    playerId: "dev-player-hugo",
  },
  {
    id: "Mtest003-team-0-Ptest002",
    matchId: "Mtest003",
    teamIndex: 0,
    playerId: "Ptest002",
  },
  {
    id: "Mtest003-team-0-ella",
    matchId: "Mtest003",
    teamIndex: 0,
    playerId: "dev-player-ella",
  },
  {
    id: "Mtest003-team-1-bob",
    matchId: "Mtest003",
    teamIndex: 1,
    playerId: "dev-player-bob",
  },
  {
    id: "Mtest003-team-1-gabe",
    matchId: "Mtest003",
    teamIndex: 1,
    playerId: "dev-player-gabe",
  },
];

const mockMatchResultApprovals = [
  "dev-player-alice",
  "dev-player-bob",
  "dev-player-cara",
  "dev-player-finn",
].map((playerId) => ({
  id: `dev-match-open-play-001-approval-${playerId}`,
  matchId: "dev-match-open-play-001",
  playerId,
  approvedAt: new Date("2026-06-05T20:10:00+09:00"),
}));

interface MockRatingChangeLog {
  id: string;
  playerId: string;
  source: "match_completed";
  sourceLogId: string;
  previousRating: PlayerDupr;
  nextRating: PlayerDupr;
  delta: PlayerDupr;
  createdAt: Date;
}

interface RatingHistoryFixture {
  matchId: string;
  playedAt: Date;
  scoreA: number;
  scoreB: number;
  type: "singles" | "mixed-doubles";
  previousRating: PlayerDupr;
  nextRating: PlayerDupr;
}

interface TestRatingHistoryFixture extends RatingHistoryFixture {
  playerId: "Ptest001" | "Ptest002";
}

const TEST_RATING_FIXTURE_MATCH_IDS = Array.from(
  { length: 27 },
  (_, index) => `Mtest${String(index + 1).padStart(3, "0")}`,
);
const LEGACY_TEST_RATING_FIXTURE_SOURCE_LOG_IDS = [
  "match-completed-Mtest001-test1",
  "match-completed-Mtest002-test2",
  "match-completed-Mtest003-test2",
];
const TEST_RATING_FIXTURE_SOURCE_LOG_IDS = [
  ...LEGACY_TEST_RATING_FIXTURE_SOURCE_LOG_IDS,
  ...TEST_RATING_FIXTURE_MATCH_IDS.map(
    (matchId) => `match-completed-${matchId}-test`,
  ),
];
const TEST_PLAYER_RATINGS = {
  Ptest001: { singles: 3.163, doubles: 3.23 },
  Ptest002: { singles: 3.31, doubles: 3.36 },
} satisfies Record<TestRatingHistoryFixture["playerId"], PlayerDupr>;
const KOREA_STANDARD_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;

interface TestRatingFixtureSchedule {
  daysBefore: number;
  hour: number;
  minute?: number;
}

const getTestFixturePlayedAt = (
  referenceAt: Date,
  schedule: TestRatingFixtureSchedule,
) => {
  // 그래프의 날짜 라벨과 같은 KST 기준으로 일자를 고정한다. 같은 daysBefore에
  // 서로 다른 시간을 지정하면 하루에 여러 경기를 한 이력을 재현할 수 있다.
  const koreaReferenceAt = new Date(
    referenceAt.getTime() + KOREA_STANDARD_TIME_OFFSET_MS,
  );

  return new Date(
    Date.UTC(
      koreaReferenceAt.getUTCFullYear(),
      koreaReferenceAt.getUTCMonth(),
      koreaReferenceAt.getUTCDate() - schedule.daysBefore,
      schedule.hour - 9,
      schedule.minute ?? 0,
    ),
  );
};

const getTodayTestFixtureSchedules = (
  referenceAt: Date,
): TestRatingFixtureSchedule[] => {
  const koreaReferenceAt = new Date(
    referenceAt.getTime() + KOREA_STANDARD_TIME_OFFSET_MS,
  );
  const minutesSinceMidnight =
    koreaReferenceAt.getUTCHours() * 60 + koreaReferenceAt.getUTCMinutes();
  const latestMinute = Math.max(2, minutesSinceMidnight - 30);
  const interval = Math.max(1, Math.floor(latestMinute / 3));

  return [latestMinute - interval * 2, latestMinute - interval, latestMinute].map(
    (minutes) => ({
      daysBefore: 0,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    }),
  );
};

const createTestRatingHistoryFixtures = (
  referenceAt: Date,
): TestRatingHistoryFixture[] => {
  const todayTestFixtureSchedules = getTodayTestFixtureSchedules(referenceAt);
  const createSeries = (
    playerId: TestRatingHistoryFixture["playerId"],
    category: "singles" | "doubles",
    matchIdStart: number,
    values: number[],
    schedules: TestRatingFixtureSchedule[],
  ): TestRatingHistoryFixture[] => {
    const currentRating = TEST_PLAYER_RATINGS[playerId];

    return values.map((value, index) => {
      const previousValue =
        index === 0 ? value - 0.012 : (values[index - 1] ?? value);
      const previousRating: PlayerDupr = {
        singles:
          category === "singles" ? previousValue : currentRating.singles,
        doubles:
          category === "doubles" ? previousValue : currentRating.doubles,
      };
      const nextRating: PlayerDupr = {
        singles: category === "singles" ? value : currentRating.singles,
        doubles: category === "doubles" ? value : currentRating.doubles,
      };

      return {
        matchId: `Mtest${String(matchIdStart + index).padStart(3, "0")}`,
        playerId,
        type: category === "singles" ? "singles" : "mixed-doubles",
        playedAt: getTestFixturePlayedAt(
          referenceAt,
          schedules[index] ?? { daysBefore: 0, hour: 19 },
        ),
        scoreA: index % 2 === 0 ? 11 : 8,
        scoreB: index % 2 === 0 ? 8 : 11,
        previousRating,
        nextRating,
      };
    });
  };

  return [
    // test1 Singles: 좌측 시작점에서 아래로 하락
    ...createSeries(
      "Ptest001",
      "singles",
      4,
      [3.31, 3.27, 3.23, 3.19],
      [
        { daysBefore: 35, hour: 19 },
        { daysBefore: 29, hour: 19 },
        { daysBefore: 23, hour: 19 },
        { daysBefore: 10, hour: 19 },
      ],
    ),
    // test1 Doubles: W형
    ...createSeries(
      "Ptest001",
      "doubles",
      10,
      [3.18, 3.258, 3.192, 3.245, 3.205, 3.23],
      [
        { daysBefore: 35, hour: 19 },
        { daysBefore: 29, hour: 19 },
        { daysBefore: 23, hour: 12 },
        { daysBefore: 23, hour: 20 },
        { daysBefore: 10, hour: 19 },
        { daysBefore: 3, hour: 19 },
      ],
    ),
    // test2 Doubles: 좌상단에서 우하단으로 하락
    ...createSeries(
      "Ptest002",
      "doubles",
      16,
      [3.62, 3.55, 3.48, 3.41, 3.4, 3.385, 3.372, 3.36],
      [
        { daysBefore: 34, hour: 19 },
        { daysBefore: 26, hour: 19 },
        { daysBefore: 18, hour: 12 },
        { daysBefore: 18, hour: 20 },
        { daysBefore: 3, hour: 19 },
        // 오늘 3경기: 현재 시각보다 최소 30분 전까지의 동일 KST 날짜 경기다.
        ...todayTestFixtureSchedules,
      ],
    ),
    // test2 Singles: U형 반등
    ...createSeries(
      "Ptest002",
      "singles",
      24,
      [3.35, 3.18, 3.22, 3.31],
      [
        { daysBefore: 32, hour: 19 },
        { daysBefore: 21, hour: 12 },
        { daysBefore: 21, hour: 20 },
        { daysBefore: 4, hour: 19 },
      ],
    ),
  ];
};

const mockPlayerRatingChangeLogs: MockRatingChangeLog[] = [
  {
    id: "dev-rating-test1-001",
    playerId: "Ptest001",
    source: "match_completed" as const,
    sourceLogId: "match-completed-Mtest001-test1",
    previousRating: { singles: 3.152, doubles: 3.154 },
    nextRating: { singles: 3.152, doubles: 3.18 },
    delta: { singles: 0, doubles: 0.026 },
    createdAt: new Date("2026-07-21T19:10:00+09:00"),
  },
  {
    id: "dev-rating-test2-001",
    playerId: "Ptest002",
    source: "match_completed" as const,
    sourceLogId: "match-completed-Mtest002-test2",
    previousRating: { singles: 3.469, doubles: 3.445 },
    nextRating: { singles: 3.469, doubles: 3.472 },
    delta: { singles: 0, doubles: 0.027 },
    createdAt: new Date("2026-07-20T19:45:00+09:00"),
  },
  {
    id: "dev-rating-test2-002",
    playerId: "Ptest002",
    source: "match_completed" as const,
    sourceLogId: "match-completed-Mtest003-test2",
    previousRating: { singles: 3.469, doubles: 3.472 },
    nextRating: { singles: 3.469, doubles: 3.486 },
    delta: { singles: 0, doubles: 0.014 },
    createdAt: new Date("2026-07-22T20:15:00+09:00"),
  },
];

const isUniqueConstraintError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE") || message.includes("unique");
};

export class TestDataRepository {
  private readonly persistedDevPlayerIds = new Map<string, string>();

  constructor(
    private db: any,
    private client: any,
    private playerRepository: PlayerRepository,
    private playerCreationLogRepository: PlayerCreationLogRepository,
    private playerStatusChangeLogRepository: PlayerStatusChangeLogRepository,
  ) {}

  async seedDevMockData() {
    for (const player of mockPlayers) {
      const existing = await this.playerRepository.findByUsername(
        player.username,
      );
      const persistedPlayer =
        existing ??
        (await this.playerRepository.create({
          ...player,
          id: toDevPlayerId(player.id),
        }));
      if (existing) {
        await this.playerRepository.updatePassword(
          existing.id,
          player.passwordHash,
          player.isFirstLogin,
        );
        if (!existing.affiliations?.length && player.affiliations?.length) {
          await this.playerRepository.updateProfile(existing.id, {
            affiliations: player.affiliations,
          });
        }
      }

      this.persistedDevPlayerIds.set(player.id, persistedPlayer.id);
      this.persistedDevPlayerIds.set(
        toDevPlayerId(player.id),
        persistedPlayer.id,
      );
    }

    await this.repairDevMockPlayerReferences();

    for (const log of mockCreationLogs) {
      await this.createCreationLogIfMissing({
        ...log,
        playerId: this.resolveDevPlayerId(log.playerId),
        createdByPlayerId: log.createdByPlayerId
          ? this.resolveDevPlayerId(log.createdByPlayerId)
          : null,
      });
    }

    for (const log of mockStatusLogs) {
      await this.createStatusLogIfMissing({
        ...log,
        playerId: this.resolveDevPlayerId(log.playerId),
        changedByPlayerId: this.resolveDevPlayerId(log.changedByPlayerId),
      });
    }

    const openPlaySessionId = await this.createSessionIfMissing({
      id: DEV_OPEN_PLAY_SESSION_ID,
      name: "일요일 오픈 플레이",
      date: new Date("2026-07-19T09:00:00+09:00"),
      location: "Dev Court A",
      createdAt: new Date("2026-07-19T08:40:00+09:00"),
      updatedAt: new Date("2026-07-19T08:40:00+09:00"),
    });
    const scheduledSessionId = await this.createSessionIfMissing({
      id: DEV_SCHEDULED_SESSION_ID,
      name: "시간 분리 검증 세션",
      date: new Date("2026-08-01T18:00:00+09:00"),
      location: "Dev Court Schedule",
      createdAt: new Date("2026-07-30T09:00:00+09:00"),
      updatedAt: new Date("2026-07-30T09:00:00+09:00"),
    });

    for (const match of mockMatches) {
      await this.createMatchIfMissing(
        {
          ...match,
          id: toDevMatchId(match.id),
          creatorPlayerId: this.resolveDevPlayerId(match.creatorPlayerId),
          sessionId:
            match.sessionId === DEV_OPEN_PLAY_SESSION_ID
              ? openPlaySessionId
              : match.sessionId === DEV_SCHEDULED_SESSION_ID
                ? scheduledSessionId
                : match.sessionId,
          resultSubmittedByPlayerId: match.resultSubmittedByPlayerId
            ? this.resolveDevPlayerId(match.resultSubmittedByPlayerId)
            : null,
        } as (typeof mockMatches)[number],
      );
    }

    for (const score of mockMatchScores) {
      await this.createMatchScoreIfMissing({
        ...score,
        matchId: toDevMatchId(score.matchId),
      });
    }

    for (const participant of mockMatchParticipants) {
      await this.createMatchParticipantIfMissing({
        ...participant,
        matchId: toDevMatchId(participant.matchId),
        playerId: this.resolveDevPlayerId(participant.playerId),
      });
    }

    for (const approval of mockMatchResultApprovals) {
      await this.createMatchResultApprovalIfMissing({
        ...approval,
        matchId: toDevMatchId(approval.matchId),
        playerId: this.resolveDevPlayerId(approval.playerId),
      });
    }

    for (const log of mockPlayerRatingChangeLogs) {
      await this.createRatingChangeLogIfMissing({
        ...log,
        playerId: this.resolveDevPlayerId(log.playerId),
      });
    }

    await this.seedAdditionalTestRatingHistory();
  }

  private resolveDevPlayerId(id: string) {
    return this.persistedDevPlayerIds.get(id) ?? toDevPlayerId(id);
  }

  private async repairDevMockPlayerReferences() {
    const replacements = [...this.persistedDevPlayerIds].filter(
      ([legacyId, persistedId]) => legacyId !== persistedId,
    );
    if (replacements.length === 0) {
      return;
    }

    const transaction = await this.client.transaction("write");
    let committed = false;
    try {
      for (const [legacyId, persistedId] of replacements) {
        for (const [table, column] of devMockPlayerReferenceColumns) {
          await transaction.execute({
            sql: `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
            args: [persistedId, legacyId],
          });
        }
        await transaction.execute({
          sql: `
            DELETE legacy FROM match_participants AS legacy
            INNER JOIN match_participants AS persisted
              ON persisted.match_id = legacy.match_id
             AND persisted.team_index = legacy.team_index
             AND persisted.player_id = ?
            WHERE legacy.player_id = ?
          `,
          args: [persistedId, legacyId],
        });
        await transaction.execute({
          sql: "UPDATE match_participants SET player_id = ? WHERE player_id = ?",
          args: [persistedId, legacyId],
        });
        await transaction.execute({
          sql: `
            DELETE legacy FROM match_result_approvals AS legacy
            INNER JOIN match_result_approvals AS persisted
              ON persisted.match_id = legacy.match_id
             AND persisted.player_id = ?
            WHERE legacy.player_id = ?
          `,
          args: [persistedId, legacyId],
        });
        await transaction.execute({
          sql:
            "UPDATE match_result_approvals SET player_id = ? WHERE player_id = ?",
          args: [persistedId, legacyId],
        });
        await transaction.execute({
          sql: `
            DELETE legacy FROM match_session_participants AS legacy
            INNER JOIN match_session_participants AS persisted
              ON persisted.session_id = legacy.session_id
             AND persisted.player_id = ?
            WHERE legacy.player_id = ?
          `,
          args: [persistedId, legacyId],
        });
        await transaction.execute({
          sql:
            "UPDATE match_session_participants SET player_id = ? WHERE player_id = ?",
          args: [persistedId, legacyId],
        });
      }

      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) {
        transaction.close();
      }
    }
  }

  private async seedAdditionalTestRatingHistory() {
    const referenceAt = new Date();
    const fixtures = createTestRatingHistoryFixtures(referenceAt);
    await this.resetTestRatingGraphFixtures();

    for (const fixture of fixtures) {
      await this.seedRatingHistoryMatch(fixture.playerId, fixture);
    }

    for (const [playerId, rating] of Object.entries(TEST_PLAYER_RATINGS)) {
      await this.playerRepository.updateDuprState(
        this.resolveDevPlayerId(playerId),
        {
          rating,
          metrics: {
            singles: { confidence: 1, accuracy: null },
            doubles: { confidence: 1, accuracy: null },
          },
        },
      );
    }
  }

  /**
   * 기존 Dev DB도 현재 fixture 양상으로 다시 맞춘다. test1/test2 seed가
   * 소유한 ID와 rating-change log만 지우므로 수동 생성 경기에는 영향이 없다.
   */
  private async resetTestRatingGraphFixtures() {
    const playerIds = Object.keys(TEST_PLAYER_RATINGS).map((playerId) =>
      this.resolveDevPlayerId(playerId),
    );
    const matchPlaceholders = TEST_RATING_FIXTURE_MATCH_IDS.map(() => "?").join(
      ", ",
    );
    const playerPlaceholders = playerIds.map(() => "?").join(", ");
    const sourceLogPlaceholders = TEST_RATING_FIXTURE_SOURCE_LOG_IDS.map(
      () => "?",
    ).join(", ");
    const transaction = await this.client.transaction("write");
    let committed = false;

    try {
      await transaction.execute({
        sql: `DELETE FROM player_rating_change_logs
              WHERE player_id IN (${playerPlaceholders})
                AND source = 'match_completed'
                AND source_log_id IN (${sourceLogPlaceholders})`,
        args: [...playerIds, ...TEST_RATING_FIXTURE_SOURCE_LOG_IDS],
      });
      for (const table of [
        "match_result_approvals",
        "match_scores",
        "match_participants",
      ]) {
        await transaction.execute({
          sql: `DELETE FROM ${table} WHERE match_id IN (${matchPlaceholders})`,
          args: TEST_RATING_FIXTURE_MATCH_IDS,
        });
      }
      await transaction.execute({
        sql: `DELETE FROM matches WHERE id IN (${matchPlaceholders})`,
        args: TEST_RATING_FIXTURE_MATCH_IDS,
      });
      await transaction.execute({
        sql: `DELETE FROM player_rating_chart_points
              WHERE player_id IN (${playerPlaceholders})`,
        args: playerIds,
      });
      await transaction.execute({
        sql: `DELETE FROM player_rating_chart_projections
              WHERE player_id IN (${playerPlaceholders})`,
        args: playerIds,
      });
      await transaction.commit();
      committed = true;
    } finally {
      if (!committed) transaction.close();
    }
  }

  private async seedRatingHistoryMatch(
    playerId: string,
    fixture: RatingHistoryFixture,
  ) {
    await this.createMatchIfMissing(
      {
        id: fixture.matchId,
        type: fixture.type,
        source: "player_created",
        creatorPlayerId: playerId,
        status: "completed",
        location: "Dev Court History",
        matchStartsAt: fixture.playedAt,
        completedAt: fixture.playedAt,
        resultSubmittedByPlayerId: playerId,
        resultSubmittedAt: fixture.playedAt,
        createdAt: fixture.playedAt,
        updatedAt: fixture.playedAt,
      } as (typeof mockMatches)[number],
    );
    await this.createMatchScoreIfMissing({
      id: `${fixture.matchId}-score-1`,
      matchId: fixture.matchId,
      scoreA: fixture.scoreA,
      scoreB: fixture.scoreB,
    });

    const participants =
      fixture.type === "singles"
        ? [
            { teamIndex: 0, playerId },
            {
              teamIndex: 1,
              playerId: this.resolveDevPlayerId("dev-player-bob"),
            },
          ]
        : [
            { teamIndex: 0, playerId },
            {
              teamIndex: 0,
              playerId: this.resolveDevPlayerId("dev-player-alice"),
            },
            {
              teamIndex: 1,
              playerId: this.resolveDevPlayerId("dev-player-bob"),
            },
            {
              teamIndex: 1,
              playerId: this.resolveDevPlayerId("dev-player-cara"),
            },
          ];
    for (const participant of participants) {
      await this.createMatchParticipantIfMissing({
        id: `${fixture.matchId}-team-${participant.teamIndex}-${participant.playerId}`,
        matchId: fixture.matchId,
        teamIndex: participant.teamIndex,
        playerId: participant.playerId,
      });
    }

    await this.createRatingChangeLogIfMissing({
      id: `dev-rating-${fixture.matchId.toLowerCase()}`,
      playerId,
      source: "match_completed",
      sourceLogId: `match-completed-${fixture.matchId}-test`,
      previousRating: fixture.previousRating,
      nextRating: fixture.nextRating,
      delta: {
        singles: fixture.nextRating.singles - fixture.previousRating.singles,
        doubles: fixture.nextRating.doubles - fixture.previousRating.doubles,
      },
      createdAt: fixture.playedAt,
    });
  }

  private async createSessionIfMissing(
    data: typeof matchSessions.$inferInsert,
  ): Promise<string> {
    const existingByMetadata = await this.db
      .select()
      .from(matchSessions)
      .where(
        and(
          eq(matchSessions.name, data.name),
          eq(matchSessions.date, data.date),
        ),
      )
      .get();
    if (existingByMetadata) return existingByMetadata.id;

    const existingById = await this.db
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, data.id))
      .get();
    if (existingById) return existingById.id;

    await this.db.insert(matchSessions).values(data);
    return data.id;
  }

  private async createCreationLogIfMissing(data: CreatePlayerCreationLogInput) {
    const existing = await this.db
      .select()
      .from(playerCreationLogs)
      .where(eq(playerCreationLogs.id, data.id))
      .get();
    if (existing) {
      return;
    }

    try {
      await this.playerCreationLogRepository.create(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async createStatusLogIfMissing(
    data: CreatePlayerStatusChangeLogInput,
  ) {
    const existing = await this.db
      .select()
      .from(playerStatusChangeLogs)
      .where(eq(playerStatusChangeLogs.id, data.id))
      .get();
    if (existing) {
      return;
    }

    try {
      await this.playerStatusChangeLogRepository.create(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async createMatchIfMissing(data: (typeof mockMatches)[number]) {
    const existing = await this.db
      .select()
      .from(matches)
      .where(eq(matches.id, data.id))
      .get();
    if (existing) {
      return;
    }

    try {
      await this.db.insert(matches).values(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async createMatchScoreIfMissing(
    data: (typeof mockMatchScores)[number],
  ) {
    const existing = await this.db
      .select()
      .from(matchScores)
      .where(eq(matchScores.matchId, data.matchId))
      .get();
    if (existing) {
      return;
    }

    try {
      await this.insertMatchScore(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async insertMatchScore(data: (typeof mockMatchScores)[number]) {
    await this.client.execute({
      sql: "INSERT INTO match_scores (id, match_id, score_a, score_b) VALUES (?, ?, ?, ?)",
      args: [data.id, data.matchId, data.scoreA, data.scoreB],
    });
  }

  private async createMatchParticipantIfMissing(
    data: (typeof mockMatchParticipants)[number],
  ) {
    const existingById = await this.db
      .select()
      .from(matchParticipants)
      .where(eq(matchParticipants.id, data.id))
      .get();
    if (existingById) {
      return;
    }

    const existingByParticipant = await this.db
      .select()
      .from(matchParticipants)
      .where(
        and(
          eq(matchParticipants.matchId, data.matchId),
          eq(matchParticipants.teamIndex, data.teamIndex),
          eq(matchParticipants.playerId, data.playerId),
        ),
      )
      .get();
    if (existingByParticipant) {
      return;
    }

    try {
      await this.db.insert(matchParticipants).values(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async createMatchResultApprovalIfMissing(
    data: (typeof mockMatchResultApprovals)[number],
  ) {
    const existingById = await this.db
      .select()
      .from(matchResultApprovals)
      .where(eq(matchResultApprovals.id, data.id))
      .get();
    if (existingById) {
      return;
    }

    const existingByApproval = await this.db
      .select()
      .from(matchResultApprovals)
      .where(
        and(
          eq(matchResultApprovals.matchId, data.matchId),
          eq(matchResultApprovals.playerId, data.playerId),
        ),
      )
      .get();
    if (existingByApproval) {
      return;
    }

    try {
      await this.db.insert(matchResultApprovals).values(data);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  private async createRatingChangeLogIfMissing(
    data: MockRatingChangeLog,
  ) {
    const existing = await this.db
      .select()
      .from(playerRatingChangeLogs)
      .where(eq(playerRatingChangeLogs.id, data.id))
      .get();
    if (existing) {
      return;
    }

    await this.db.insert(playerRatingChangeLogs).values({
      id: data.id,
      playerId: data.playerId,
      source: data.source,
      sourceLogId: data.sourceLogId,
      previousRatingJson: JSON.stringify(data.previousRating),
      nextRatingJson: JSON.stringify(data.nextRating),
      deltaJson: JSON.stringify(data.delta),
      createdAt: data.createdAt,
    });
  }
}

export const isDevMockDataEnabled = () =>
  process.env.ENABLE_DEV_MOCK_DATA === "true";

export const getDevMockUsernames = () =>
  mockPlayers.map(({ username, status }) => ({ username, status }));
