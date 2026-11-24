import type { NextFunction, Request, Response } from "express";
import { DATA_KINDS, type DataKind } from "@pkpkdupr/shared/dataSync";
import type { DataChangeSignal } from "../services/DataChangeSignal";

/** 신호를 보내지 않는 읽기 메서드 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const MATCH_KINDS: readonly DataKind[] = [
  "sessions",
  "matches",
  "ratings",
  "achievements",
];
/** 경기 시작은 진행 중 경기를 만들고 선수를 참여자로 넣을 뿐 평점·업적은 바꾸지 않는다 */
const MATCH_START_KINDS: readonly DataKind[] = ["sessions", "matches"];
/** 활성·승급처럼 랭킹·업적 랭킹 대상이 바뀌는 회원 변경 */
const PLAYER_ROSTER_KINDS: readonly DataKind[] = [
  "players",
  "ratings",
  "achievements",
];
const RATING_KINDS: readonly DataKind[] = ["matches", "ratings", "achievements"];

interface SignalRoute {
  /** 없으면 읽기가 아닌 모든 메서드 */
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  pattern: RegExp;
  kinds: readonly DataKind[];
}

/**
 * 쓰기 경로별로 바뀌는 데이터 종류. 위에서부터 처음 맞는 줄을 쓰고, 맞는 줄이 없으면 모든 종류를 보낸다.
 * 경로는 끝 `/`를 뗀 뒤 Express 라우팅처럼 대소문자를 구분하지 않고 맞춘다. 새 쓰기 라우트를 추가하면 여기에 줄을 넣는다
 */
const SIGNAL_ROUTES: readonly SignalRoute[] = [
  // 본인에게만 영향이 있는 쓰기
  { method: "POST", pattern: /^\/api\/me\/password-changed$/i, kinds: [] },
  { method: "POST", pattern: /^\/api\/me\/achievements\/seen$/i, kinds: [] },
  // 회원
  { method: "PATCH", pattern: /^\/api\/me\/profile$/i, kinds: ["players"] },
  { pattern: /^\/api\/me\/avatar$/i, kinds: ["players"] },
  // 세션
  {
    method: "POST",
    pattern: /^\/api\/match-sessions\/[^/]+\/matches$/i,
    kinds: MATCH_START_KINDS,
  },
  {
    method: "POST",
    pattern: /^\/api\/match-sessions\/[^/]+\/guests$/i,
    kinds: ["sessions", "players"],
  },
  // 정기 세션 완료는 세션 지배자·무패 세션 업적을 확정한다
  {
    method: "POST",
    pattern: /^\/api\/match-sessions\/[^/]+\/complete$/i,
    kinds: ["sessions", "achievements"],
  },
  // 세션 칭찬은 칭찬 수와 칭찬 업적(이쁨받기·이 구역 사랑둥이)을 바꾼다
  {
    method: "POST",
    pattern: /^\/api\/match-sessions\/[^/]+\/praise$/i,
    kinds: ["sessions", "achievements"],
  },
  { pattern: /^\/api\/match-sessions(\/.*)?$/i, kinds: ["sessions"] },
  // 경기
  { method: "POST", pattern: /^\/api\/matches\/start$/i, kinds: MATCH_START_KINDS },
  {
    method: "POST",
    pattern: /^\/api\/matches\/[^/]+\/start$/i,
    kinds: MATCH_START_KINDS,
  },
  { pattern: /^\/api\/matches(\/.*)?$/i, kinds: MATCH_KINDS },
  // 예약 작업
  { pattern: /^\/api\/cron\/.+$/i, kinds: ["sessions"] },
  // 관리자 경기
  { pattern: /^\/api\/admin\/matches(\/.*)?$/i, kinds: MATCH_KINDS },
  // 관리자 세션
  {
    method: "POST",
    pattern: /^\/api\/admin\/match-sessions\/[^/]+\/bracket-matches$/i,
    kinds: ["sessions", "matches"],
  },
  // 대회 순위는 순위 업적(포디움·우승·3관왕)을 바꾼다
  {
    method: "PUT",
    pattern: /^\/api\/admin\/match-sessions\/[^/]+\/placements$/i,
    kinds: ["sessions", "achievements"],
  },
  // 세션 종류·날짜는 경기 응답의 세션 정보와 개근상·순위 변동 기준 세션에도 쓰인다
  { pattern: /^\/api\/admin\/match-sessions(\/.*)?$/i, kinds: MATCH_KINDS },
  { pattern: /^\/api\/admin\/regular-session-skips(\/.*)?$/i, kinds: ["sessions"] },
  // 관리자 평점
  { pattern: /^\/api\/admin\/ratings\/recalculate$/i, kinds: RATING_KINDS },
  {
    method: "POST",
    pattern: /^\/api\/admin\/players\/[^/]+\/official-dupr\/preview$/i,
    kinds: [],
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/players\/[^/]+\/official-dupr$/i,
    kinds: RATING_KINDS,
  },
  // 관리자 회원
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/players\/[^/]+\/status$/i,
    kinds: PLAYER_ROSTER_KINDS,
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/players\/[^/]+\/promote$/i,
    kinds: PLAYER_ROSTER_KINDS,
  },
  { pattern: /^\/api\/admin\/players(\/.*)?$/i, kinds: ["players"] },
  { method: "POST", pattern: /^\/api\/admin\/register$/i, kinds: ["players"] },
];

const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/";

/**
 * 요청이 2xx로 끝났을 때 보낼 데이터 종류. 빈 배열이면 보내지 않는다.
 * `/api/` 밖 경로와 읽기 메서드는 보내지 않고, 표에 없는 쓰기 경로는 모든 종류를 보낸다
 */
export const resolveDataChangeKinds = (
  method: string,
  path: string,
): readonly DataKind[] => {
  const upperMethod = method.toUpperCase();
  const normalizedPath = normalizePath(path);
  if (READ_METHODS.has(upperMethod) || !/^\/api\//i.test(normalizedPath)) {
    return [];
  }
  const route = SIGNAL_ROUTES.find(
    (candidate) =>
      (!candidate.method || candidate.method === upperMethod) &&
      candidate.pattern.test(normalizedPath),
  );
  return route ? route.kinds : DATA_KINDS;
};

/**
 * 쓰기 요청이 2xx로 끝나면 바뀐 데이터 종류 신호를 보낸다. 응답을 보낸 뒤(`finish`) 보내므로 응답을 막지 않는다.
 * 저장소 메서드마다 신호를 다는 대신 여기 한 곳에서 보내 관리자 쓰기를 포함해 누락을 막는다
 */
export const createDataChangeSignalMiddleware =
  (signal: Pick<DataChangeSignal, "send">) =>
  (req: Request, res: Response, next: NextFunction) => {
    const kinds = resolveDataChangeKinds(req.method, req.path);
    if (kinds.length > 0) {
      res.once("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          signal.send(kinds);
        }
      });
    }
    next();
  };
