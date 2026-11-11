import {
  createDefaultPlayerDupr,
  createDefaultPlayerDuprMetrics,
  type StoredPlayerDupr,
} from "@pkpkdupr/shared/player";
import { describe, expect, it } from "vitest";
import {
  getDecayedConfidenceByInactivity,
  getTeamPointShares,
  ScorePerformanceRatingService,
} from "../services/ScorePerformanceRatingService";

const DAY_MS = 24 * 60 * 60 * 1000;

const createState = (rating = 3, confidence = 0): StoredPlayerDupr => ({
  rating: createDefaultPlayerDupr(rating),
  metrics: createDefaultPlayerDuprMetrics(confidence),
});

describe("ScorePerformanceRatingService", () => {
  it("2주 유예 후 1일마다 1.5씩 confidence가 감소하고 floor는 0이다", () => {
    expect(getDecayedConfidenceByInactivity(50, 14 * DAY_MS)).toBe(50);
    expect(getDecayedConfidenceByInactivity(50, 15 * DAY_MS)).toBe(48.5);
    expect(getDecayedConfidenceByInactivity(50, 20 * DAY_MS)).toBe(41);
    expect(getDecayedConfidenceByInactivity(5, 30 * DAY_MS)).toBe(0);
  });

  it("세트 점수를 합산해 양 팀의 실제 득점률을 계산한다", () => {
    expect(
      getTeamPointShares([
        { scoreA: 11, scoreB: 7 },
        { scoreA: 11, scoreB: 5 },
      ]),
    ).toEqual([22 / 34, 12 / 34]);
    expect(getTeamPointShares()).toBeNull();
    expect(getTeamPointShares([{ scoreA: 0, scoreB: 0 }])).toBeNull();
  });

  it("동률 팀은 승패가 아니라 실제 득점률만큼 평점이 변한다", () => {
    const service = new ScorePerformanceRatingService();
    const result = service.replayMatch({
      type: "mixed-doubles",
      winnerTeamIndex: 0,
      scores: [{ scoreA: 11, scoreB: 9 }],
      participants: [
        { playerId: "a", teamIndex: 0, state: createState() },
        { playerId: "b", teamIndex: 0, state: createState() },
        { playerId: "c", teamIndex: 1, state: createState() },
        { playerId: "d", teamIndex: 1, state: createState() },
      ],
    });

    expect(result.a.rating.doubles).toBe(3.016);
    expect(result.b.rating.doubles).toBe(3.016);
    expect(result.c.rating.doubles).toBe(2.984);
    expect(result.d.rating.doubles).toBe(2.984);
  });

  it("강팀이 기대보다 적은 점수 차로 이기면 승자 평점도 내려갈 수 있다", () => {
    const service = new ScorePerformanceRatingService();
    const result = service.replayMatch({
      type: "women-doubles",
      winnerTeamIndex: 0,
      scores: [
        { scoreA: 11, scoreB: 7 },
        { scoreA: 11, scoreB: 5 },
      ],
      participants: [
        { playerId: "a", teamIndex: 0, state: createState(6.529, 100) },
        { playerId: "b", teamIndex: 0, state: createState(6.903, 100) },
        { playerId: "c", teamIndex: 1, state: createState(6.314, 100) },
        { playerId: "d", teamIndex: 1, state: createState(6.15, 100) },
      ],
    });

    expect(result.a.rating.doubles).toBeLessThan(6.529);
    expect(result.b.rating.doubles).toBeLessThan(6.903);
    expect(result.c.rating.doubles).toBeGreaterThan(6.314);
    expect(result.d.rating.doubles).toBeGreaterThan(6.15);
  });

  it("M6nix34e 조건에서는 기대보다 근소한 B팀이 모두 하락한다", () => {
    const service = new ScorePerformanceRatingService();
    const result = service.replayMatch({
      type: "unrestricted-doubles",
      winnerTeamIndex: 1,
      scores: [
        { scoreA: 4, scoreB: 11 },
        { scoreA: 10, scoreB: 12 },
      ],
      participants: [
        { playerId: "neiz", teamIndex: 0, state: createState(3.275, 50) },
        { playerId: "colin", teamIndex: 0, state: createState(2.825, 50) },
        { playerId: "cloud", teamIndex: 1, state: createState(3.521, 50) },
        { playerId: "scarlett", teamIndex: 1, state: createState(3.245, 50) },
      ],
    });

    expect(result.neiz.rating.doubles).toBeGreaterThan(3.275);
    expect(result.colin.rating.doubles).toBeGreaterThan(2.825);
    expect(result.cloud.rating.doubles).toBeLessThan(3.521);
    expect(result.scarlett.rating.doubles).toBeLessThan(3.245);
  });

  it("점수가 없는 과거 경기는 기존 승패 방식으로 계산한다", () => {
    const service = new ScorePerformanceRatingService();
    const result = service.replayMatch({
      type: "singles",
      winnerTeamIndex: 0,
      participants: [
        { playerId: "winner", teamIndex: 0, state: createState() },
        { playerId: "loser", teamIndex: 1, state: createState() },
      ],
    });

    expect(result.winner.rating.singles).toBe(3.16);
    expect(result.loser.rating.singles).toBe(2.84);
  });

  it("단일 경기 평점 변화량을 최대 ±0.2로 제한한다", () => {
    const service = new ScorePerformanceRatingService();

    expect(
      service.calculate({
        currentRating: 3,
        expectedPointShare: 0,
        actualPointShare: 1,
        confidence: 0,
        peerConfidence: 0,
      }).ratingChange,
    ).toBe(0.2);
    expect(
      service.calculate({
        currentRating: 3,
        expectedPointShare: 1,
        actualPointShare: 0,
        confidence: 0,
        peerConfidence: 0,
      }).ratingChange,
    ).toBe(-0.2);
  });

  it("같은 팀의 performance gap에도 confidence별 K-factor를 적용한다", () => {
    const service = new ScorePerformanceRatingService();
    const result = service.replayMatch({
      type: "mixed-doubles",
      winnerTeamIndex: 0,
      scores: [{ scoreA: 11, scoreB: 9 }],
      participants: [
        { playerId: "low", teamIndex: 0, state: createState(3, 0) },
        { playerId: "high", teamIndex: 0, state: createState(3, 100) },
        { playerId: "c", teamIndex: 1, state: createState(3, 100) },
        { playerId: "d", teamIndex: 1, state: createState(3, 100) },
      ],
    });

    expect(result.low.rating.doubles - 3).toBeGreaterThan(
      result.high.rating.doubles - 3,
    );
  });
});
