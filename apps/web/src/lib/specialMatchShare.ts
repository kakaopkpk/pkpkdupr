import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { formatKstFullDate } from "@/lib/format";
import { getObjectParticle } from "@/lib/korean";

/*
 * 특수 매치 큰 연출(도전 성공·연승 저지·최강자전 승리)의 "이미지로 공유" 내용.
 * 모양은 docs/design.md "특수 매치 공유"를 따른다. 리벤지 성공은 큰 연출이 없어 대상이 아니다.
 */

export interface SpecialMatchSharePlayer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface SpecialMatchShareRankRow {
  player: SpecialMatchSharePlayer;
  /** 경기 뒤 순위 */
  rank: number;
  /** 순위 변동 칸 수(양수) */
  change: number;
}

interface SpecialMatchShareBase {
  matchId: string;
  /** 공유한 회원(연출을 본 회원) 아이디. 이미지 맨 아래 왼쪽에 쓴다 */
  username: string;
  /** 경기 완료 시각 */
  playedAt: string;
  /** 경기가 속한 세션 이름. 세션 없는 경기는 null */
  sessionName: string | null;
}

export type SpecialMatchShareTarget = SpecialMatchShareBase &
  (
    | {
        kind: "challenge";
        category: MatchTopLevelType;
        /** 순위가 올라 위 줄이 된 회원(▲) */
        winner: SpecialMatchShareRankRow;
        /** 넘어선 회원(▼) */
        passed: SpecialMatchShareRankRow;
      }
    | {
        kind: "streak-break";
        /** 연승이 끊긴 회원 */
        loser: SpecialMatchSharePlayer;
        brokenStreak: number;
      }
    | {
        kind: "king-win";
        /** 연승을 이어 간 회원 */
        winner: SpecialMatchSharePlayer;
        /** 이 경기까지 센 이긴 쪽 연승 */
        winnerStreak: number;
        loser: SpecialMatchSharePlayer;
        brokenStreak: number;
      }
  );

export type SpecialMatchShareKind = SpecialMatchShareTarget["kind"];

/** 문구 조각. highlight가 있으면 그 색으로 굵게 칠하고, fit이면 한 줄에 안 들어갈 때 말줄임으로 줄인다(아이디) */
export interface SpecialMatchCaptionPart {
  text: string;
  highlight?: "up" | "amber";
  fit?: boolean;
}

const TITLES: Record<SpecialMatchShareKind, string> = {
  challenge: "도전 성공!",
  "streak-break": "연승 저지!",
  "king-win": "최강자전 승리!",
};

const CATEGORY_LABELS: Record<MatchTopLevelType, string> = {
  doubles: "복식",
  singles: "단식",
};

export const getSpecialMatchShareTitle = (kind: SpecialMatchShareKind) => TITLES[kind];

export const getRankingCategoryLabel = (category: MatchTopLevelType) =>
  `${CATEGORY_LABELS[category]} 랭킹`;

/** 흰 카드 아래 문구. 큰 연출 끝 화면의 문구와 같다 */
export const getSpecialMatchCaptionParts = (
  target: SpecialMatchShareTarget,
): SpecialMatchCaptionPart[] => {
  switch (target.kind) {
    case "challenge": {
      const passed = target.passed.player.username;
      return [
        { text: passed, fit: true },
        { text: `${getObjectParticle(passed)} 넘어 ` },
        { text: `${target.winner.rank}위`, highlight: "up" },
      ];
    }
    case "streak-break":
      return [
        { text: target.loser.username, fit: true },
        { text: "의 " },
        { text: `${target.brokenStreak}연승`, highlight: "amber" },
        { text: "을 끊었어요" },
      ];
    case "king-win":
      return [
        { text: target.loser.username, fit: true },
        { text: "의 " },
        { text: `${target.brokenStreak}연승`, highlight: "amber" },
        { text: "을 끊고 " },
        { text: `${target.winnerStreak}연승`, highlight: "amber" },
      ];
  }
};

/**
 * 공유 시트에 함께 보내는 문구. 주어는 그 일을 한 회원이다
 * (도전 성공·최강자전은 순위·연승의 주인, 연승 저지는 공유한 회원)
 */
export const getSpecialMatchShareText = (target: SpecialMatchShareTarget) => {
  switch (target.kind) {
    case "challenge": {
      const passed = target.passed.player.username;
      return `${target.winner.player.username}님이 ${passed}${getObjectParticle(passed)} 넘어 ${CATEGORY_LABELS[target.category]} ${target.winner.rank}위가 됐어요`;
    }
    case "streak-break":
      return `${target.username}님이 ${target.loser.username}의 ${target.brokenStreak}연승을 끊었어요`;
    case "king-win":
      return `${target.winner.username}님이 ${target.loser.username}의 ${target.brokenStreak}연승을 끊고 ${target.winnerStreak}연승을 이어가요`;
  }
};

/** 아래 줄 날짜. 세션 경기면 " · 세션 이름"을 붙인다 */
export const getSpecialMatchShareDateLabel = (playedAt: string, sessionName: string | null) => {
  const date = formatKstFullDate(playedAt);
  const name = sessionName?.trim();
  return name ? `${date} · ${name}` : date;
};

/** 공유·내려받기 파일 이름 */
export const getSpecialMatchShareFileName = (target: SpecialMatchShareTarget) =>
  `pkpkdupr-${target.kind}-${target.matchId.replace(/[^A-Za-z0-9.-]/g, "-")}.png`;

/** 같은 이미지인지 가르는 값. 이 값이 바뀔 때만 이미지를 다시 만든다 */
export const getSpecialMatchShareKey = (target: SpecialMatchShareTarget) =>
  JSON.stringify(target);
