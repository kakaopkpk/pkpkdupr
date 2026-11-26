import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import { formatKstFullDate, MATCH_CATEGORY_LABELS } from "@/lib/format";
import { getObjectParticle } from "@/lib/korean";
import { toShareFileName } from "@/lib/shareImage";
import { formatRating } from "@/utils/dupr";

/*
 * 특수 매치 큰 연출(라이벌전 승리·연승 저지·최강자전 승리·도전 성공)의 "이미지로 공유" 내용.
 * 모양은 docs/design.md "특수 매치 공유"를 따른다. 리벤지 성공은 큰 연출이 없어 대상이 아니다.
 */

/** 큰 연출 화면과 공유 이미지가 같이 쓰는 문구 */
export const STREAK_END_LABEL = "연승 끝";
export const VS_LABEL = "VS";

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
        kind: "rival";
        category: MatchTopLevelType;
        /** 순위가 올라 상대를 넘어선 회원(▲) */
        winner: SpecialMatchShareRankRow;
        /** 이긴 회원이 넘어선 회원(▼) */
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
    | {
        kind: "challenge-win";
        /** 진 높은 팀 선수(팀 순서) */
        defeated: SpecialMatchSharePlayer[];
        /** 시작 때 두 팀 평균 평점 차 */
        ratingGap: number;
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
  rival: "라이벌전 승리",
  "streak-break": "연승 저지",
  "king-win": "최강자전 승리",
  "challenge-win": "도전 성공",
};

/** 도전 성공 이름 줄: 진 높은 팀 아이디를 " · "로 잇는다 */
export const getChallengeDefeatedNames = (defeated: readonly SpecialMatchSharePlayer[]) =>
  defeated.map((player) => player.username).join(" · ");

export const getSpecialMatchShareTitle = (kind: SpecialMatchShareKind) => TITLES[kind];

/** 제목 아래 문구. 큰 연출 끝 화면의 문구와 같다 */
export const getSpecialMatchCaptionParts = (
  target: SpecialMatchShareTarget,
): SpecialMatchCaptionPart[] => {
  switch (target.kind) {
    case "rival": {
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
    case "challenge-win":
      return [
        { text: "평균 평점이 " },
        { text: formatRating(target.ratingGap), highlight: "up" },
        { text: " 높은 팀을 이겼어요" },
      ];
  }
};

/**
 * 공유 시트에 함께 보내는 문구. 주어는 그 일을 한 회원이다
 * (라이벌전 승리·최강자전은 순위·연승의 주인, 연승 저지·도전 성공은 공유한 회원)
 */
export const getSpecialMatchShareText = (target: SpecialMatchShareTarget) => {
  switch (target.kind) {
    case "rival": {
      const passed = target.passed.player.username;
      return `${target.winner.player.username}님이 ${passed}${getObjectParticle(passed)} 넘어 ${MATCH_CATEGORY_LABELS[target.category]} ${target.winner.rank}위가 됐어요`;
    }
    case "streak-break":
      return `${target.username}님이 ${target.loser.username}의 ${target.brokenStreak}연승을 끊었어요`;
    case "king-win":
      return `${target.winner.username}님이 ${target.loser.username}의 ${target.brokenStreak}연승을 끊고 ${target.winnerStreak}연승을 이어가요`;
    case "challenge-win":
      return `${target.username}님이 평균 평점이 ${formatRating(target.ratingGap)} 높은 팀을 이겼어요`;
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
  toShareFileName(target.kind, target.matchId);

/** 같은 이미지인지 가르는 값. 이 값이 바뀔 때만 이미지를 다시 만든다 */
export const getSpecialMatchShareKey = (target: SpecialMatchShareTarget) =>
  JSON.stringify(target);
