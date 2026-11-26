import { describe, expect, it } from "vitest";
import {
  getChallengeDefeatedNames,
  getSpecialMatchCaptionParts,
  getSpecialMatchShareDateLabel,
  getSpecialMatchShareFileName,
  getSpecialMatchShareText,
  getSpecialMatchShareTitle,
  type SpecialMatchShareTarget,
} from "@/lib/specialMatchShare";

const base = {
  matchId: "m-1",
  username: "wes.lee",
  playedAt: "2026-11-23T11:30:00.000Z",
  sessionName: "월요 정기운동",
};

const rival: SpecialMatchShareTarget = {
  ...base,
  kind: "rival",
  category: "doubles",
  winner: { player: { id: "p1", username: "sean.oh" }, rank: 11, change: 3 },
  passed: { player: { id: "p2", username: "jackie.hur" }, rank: 12, change: 1 },
};

const streakBreak: SpecialMatchShareTarget = {
  ...base,
  username: "joel.choi",
  kind: "streak-break",
  loser: { id: "p3", username: "martin.bok" },
  brokenStreak: 5,
};

const kingWin: SpecialMatchShareTarget = {
  ...base,
  username: "brad.ley",
  kind: "king-win",
  winner: { id: "p4", username: "brad.ley" },
  winnerStreak: 6,
  loser: { id: "p5", username: "colin.34" },
  brokenStreak: 7,
};

const challengeWin: SpecialMatchShareTarget = {
  ...base,
  username: "scarlett.yoon",
  kind: "challenge-win",
  defeated: [
    { id: "p6", username: "martin.bok" },
    { id: "p7", username: "sean.oh" },
  ],
  ratingGap: 0.253,
};

describe("도전 성공 공유", () => {
  it("제목은 도전 성공이고 문구는 평점 차(소수점 셋째 자리)만 상승색이다", () => {
    expect(getSpecialMatchShareTitle("challenge-win")).toBe("도전 성공");
    expect(getSpecialMatchCaptionParts(challengeWin)).toEqual([
      { text: "평균 평점이 " },
      { text: "0.253", highlight: "up" },
      { text: " 높은 팀을 이겼어요" },
    ]);
    expect(getSpecialMatchCaptionParts({ ...challengeWin, ratingGap: 0.1 })[1]?.text).toBe("0.100");
  });

  it("공유 문구는 공유한 회원이 주어이고, 이름 줄은 진 팀 아이디를 잇는다", () => {
    expect(getSpecialMatchShareText(challengeWin)).toBe(
      "scarlett.yoon님이 평균 평점이 0.253 높은 팀을 이겼어요",
    );
    expect(getChallengeDefeatedNames(challengeWin.defeated)).toBe("martin.bok · sean.oh");
  });
});

describe("getSpecialMatchShareTitle", () => {
  it("연출 제목과 같다", () => {
    expect(getSpecialMatchShareTitle("rival")).toBe("라이벌전 승리");
    expect(getSpecialMatchShareTitle("streak-break")).toBe("연승 저지");
    expect(getSpecialMatchShareTitle("king-win")).toBe("최강자전 승리");
  });
});

describe("getSpecialMatchCaptionParts", () => {
  const join = (target: SpecialMatchShareTarget) =>
    getSpecialMatchCaptionParts(target)
      .map((part) => (part.highlight ? `[${part.text}]` : part.text))
      .join("");

  it("라이벌전 승리는 넘어선 회원과 새 순위(상승색)", () => {
    expect(join(rival)).toBe("jackie.hur를 넘어 [11위]");
    expect(getSpecialMatchCaptionParts(rival).at(-1)?.highlight).toBe("up");
  });

  it("받침 있는 한글 아이디면 '을'", () => {
    const target = {
      ...rival,
      passed: { ...rival.passed, player: { id: "p2", username: "김준" } },
    } as SpecialMatchShareTarget;
    expect(join(target)).toBe("김준을 넘어 [11위]");
  });

  it("연승 저지는 끊긴 연승을 앰버로", () => {
    expect(join(streakBreak)).toBe("martin.bok의 [5연승]을 끊었어요");
  });

  it("최강자전 승리는 끊긴 연승과 이어 간 연승", () => {
    expect(join(kingWin)).toBe("colin.34의 [7연승]을 끊고 [6연승]");
  });

  it("넘치면 줄일 조각은 상대 아이디 하나", () => {
    for (const [target, username] of [
      [rival, "jackie.hur"],
      [streakBreak, "martin.bok"],
      [kingWin, "colin.34"],
    ] as const) {
      const fitParts = getSpecialMatchCaptionParts(target).filter((part) => part.fit);
      expect(fitParts).toEqual([{ text: username, fit: true }]);
    }
  });
});

describe("getSpecialMatchShareText", () => {
  it("라이벌전 승리는 순위가 오른 회원이 주어이고 종목을 붙인다", () => {
    expect(getSpecialMatchShareText(rival)).toBe("sean.oh님이 jackie.hur를 넘어 복식 11위가 됐어요");
    expect(getSpecialMatchShareText({ ...rival, category: "singles" } as SpecialMatchShareTarget)).toBe(
      "sean.oh님이 jackie.hur를 넘어 단식 11위가 됐어요",
    );
  });

  it("연승 저지는 공유한 회원이 주어", () => {
    expect(getSpecialMatchShareText(streakBreak)).toBe("joel.choi님이 martin.bok의 5연승을 끊었어요");
  });

  it("최강자전 승리는 이긴 회원이 주어", () => {
    expect(getSpecialMatchShareText(kingWin)).toBe(
      "brad.ley님이 colin.34의 7연승을 끊고 6연승을 이어가요",
    );
  });
});

describe("getSpecialMatchShareDateLabel", () => {
  it("세션 경기면 날짜 뒤에 세션 이름", () => {
    expect(getSpecialMatchShareDateLabel(base.playedAt, "월요 정기운동")).toBe(
      "2026년 11월 23일 · 월요 정기운동",
    );
  });

  it("세션 없는 경기면 날짜만", () => {
    expect(getSpecialMatchShareDateLabel(base.playedAt, null)).toBe("2026년 11월 23일");
    expect(getSpecialMatchShareDateLabel(base.playedAt, "  ")).toBe("2026년 11월 23일");
  });

  it("KST 날짜로 쓴다", () => {
    expect(getSpecialMatchShareDateLabel("2026-11-23T15:30:00.000Z", null)).toBe("2026년 11월 24일");
  });
});

describe("getSpecialMatchShareFileName", () => {
  it("연출 종류와 경기 id로 PNG 파일 이름을 만든다", () => {
    expect(getSpecialMatchShareFileName(streakBreak)).toBe("pkpkdupr-streak-break-m-1.png");
  });

  it("파일 이름에 못 쓰는 글자는 -로 바꾼다", () => {
    expect(getSpecialMatchShareFileName({ ...kingWin, matchId: "a/b c" })).toBe(
      "pkpkdupr-king-win-a-b-c.png",
    );
  });
});
