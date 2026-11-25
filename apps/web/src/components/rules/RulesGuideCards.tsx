import React from "react";
import { cx } from "@/components/ui/cx";
import { BounceVolleyFigure } from "./figures/BounceVolleyFigure";
import { EtiquetteFigure } from "./figures/EtiquetteFigure";
import { GameWalkthroughFigure } from "./figures/GameWalkthroughFigure";
import { LineCallFigure } from "./figures/LineCallFigure";
import { NonVolleyZoneFigure } from "./figures/NonVolleyZoneFigure";
import { ScoreCallFigure } from "./figures/ScoreCallFigure";
import { ScoringFigure } from "./figures/ScoringFigure";
import { ServeFigure } from "./figures/ServeFigure";
import { ServeOrderFigure } from "./figures/ServeOrderFigure";
import { TwoBounceFigure } from "./figures/TwoBounceFigure";
import { WinConditionFigure } from "./figures/WinConditionFigure";
import { RuleItem, RuleList, RuleTableRow } from "./RulesGuideParts";

/** 카드 한 장. 화면이 그림 → 머리(eyebrow·title) → body 순서로 그린다 */
export interface RulesGuideCard {
  eyebrow: string;
  title: string;
  /** 위 그림. 없으면 머리부터 시작한다 */
  Figure?: React.FC;
  body: React.ReactNode;
  /** 움직임 줄이기면 멈춰 보일 장면(한 바퀴 안의 초) */
  stillSeconds: number;
}

/** 팀 이름 칩 + 설명 한 줄(투 바운스 카드). 공격팀 칩은 블루, 수비팀은 짙은 남색이다 */
const TeamRuleRow: React.FC<{
  team: "attack" | "defense";
  children: React.ReactNode;
}> = ({ team, children }) => (
  <div className="flex gap-2.5 text-pk-15 leading-[1.5] text-pk-ink">
    <span
      className={cx(
        "mt-0.5 shrink-0 self-start whitespace-nowrap rounded-full px-2 py-0.5 text-pk-12 leading-[18px] font-bold text-white",
        team === "attack" ? "bg-pk-primary" : "bg-pk-deep",
      )}
    >
      {team === "attack" ? "공격팀" : "수비팀"}
    </span>
    <span>{children}</span>
  </div>
);

const ETIQUETTE_ROWS: readonly { label: string; body: React.ReactNode }[] = [
  {
    label: "마무리 인사",
    body: (
      <>
        경기가 끝나면 네트에서 <b>패들을 맞대고</b> 인사해요
      </>
    ),
  },
  {
    label: '"볼!"',
    body: (
      <>
        옆 코트 공이 들어오면 <b>"볼!"</b>이라고 외치고 그 랠리는 다시 해요
      </>
    ),
  },
  {
    label: "지나갈 때",
    body: (
      <>
        다른 코트 뒤는 <b>랠리가 끝난 뒤</b>에 지나가요
      </>
    ),
  },
  {
    label: "서브 전",
    body: (
      <>
        <b>상대가 준비됐는지</b> 확인하고 점수를 크게 부르고 서브해요
      </>
    ),
  },
];

const PIKAPIKA_ROWS: readonly { label: string; body: React.ReactNode }[] = [
  { label: "경기", body: <b>11점 단판</b> },
  {
    label: "최대",
    body: (
      <>
        <b>15점</b>까지만 (14:14면 다음 점수로 끝)
      </>
    ),
  },
  {
    label: "기록",
    body: (
      <>
        게임이 끝나고서 <b>이긴 팀</b>에서 한 명이 앱에 점수를 입력해요
      </>
    ),
  },
];

/**
 * 신입 회원용 피클볼 기본 규칙 카드. 화면에서 이 순서대로 넘기고,
 * n번째(1부터) 카드의 그림 움직임은 rulesGuide.css의 .pk-rules-c{n} 범위다
 */
export const RULES_GUIDE_CARDS: readonly RulesGuideCard[] = [
  {
    eyebrow: "규칙 1",
    title: "11점 먼저, 2점 차로",
    Figure: WinConditionFigure,
    stillSeconds: 3.6,
    body: (
      <RuleList>
        <RuleItem>
          <b>11점</b>을 먼저 내고 <b>2점 차 이상</b> 나면 이겨요.
        </RuleItem>
        <RuleItem>10:10이 되면 2점 차가 날 때까지 이어가요.</RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 2",
    title: "점수는 공격팀만",
    Figure: ScoringFigure,
    stillSeconds: 4.9,
    body: (
      <RuleList>
        <RuleItem>
          서브하는 팀을 <b>공격팀</b>, 받는 팀을 <b>수비팀</b>이라고 불러요.
        </RuleItem>
        <RuleItem>
          랠리를 이기면 <b>공격팀만</b> 1점을 얻어요.
        </RuleItem>
        <RuleItem>
          공격팀은 <b>서브 기회가 2번</b>이에요(두 사람이 한 번씩). 둘 다 지면
          점수는 그대로, 서브권이 수비팀으로 넘어가요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 3",
    title: "복식 서브 순서",
    Figure: ServeOrderFigure,
    stillSeconds: 5.9,
    body: (
      <RuleList>
        <RuleItem>
          서브권을 가져오면 늘 <b>오른쪽</b> 자리 사람이 1번으로 먼저 서브해요.
        </RuleItem>
        <RuleItem>
          점수를 얻으면 파트너와 <b>좌우를 바꿔</b> 같은 사람이 계속 서브해요.
        </RuleItem>
        <RuleItem>
          지면 <b>2번</b>이 그 자리에서, 2번도 지면 <b>상대 팀</b>이 서브해요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 4",
    title: "서브는 대각선 코트로",
    Figure: ServeFigure,
    stillSeconds: 12.6,
    body: (
      <RuleList>
        <RuleItem>
          공을 <b>허리 아래</b>에서 맞혀 아래에서 위로 쳐요. 떨어뜨려 바운스된
          뒤 쳐도 돼요.
        </RuleItem>
        <RuleItem>
          <b>베이스라인 뒤</b>에서 <b>대각선</b> 코트로 넣어요.
        </RuleItem>
        <RuleItem tone="fault">
          <b>논 발리 존</b>, <b>대각선이 아닌 코트</b>, <b>코트 밖</b>에
          떨어지면 폴트. 기회는 한 번이에요.
        </RuleItem>
        <RuleItem>
          네트에 맞고 대각선 코트에 들어가면 다시 서브해요. 한 번 더 네트에
          맞으면 폴트로 쳐요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 5",
    title: "서브 시 스코어 외치기",
    Figure: ScoreCallFigure,
    stillSeconds: 5.2,
    body: (
      <RuleList>
        <RuleItem>
          서브하기 전에 서브하는 사람은 스코어를 <b>영어로 크게</b> 외쳐야
          해요.
        </RuleItem>
        <RuleItem>
          <b>공격팀 점수 → 수비팀 점수 → 서버 번호</b> 순서예요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "정리",
    title: "경기 시뮬레이션",
    Figure: GameWalkthroughFigure,
    stillSeconds: 3.7,
    body: (
      <RuleList>
        <RuleItem>
          서브 전에 <b>공격팀 점수 → 수비팀 점수 → 서버 번호</b>를 불러요.
        </RuleItem>
        <RuleItem>
          경기 첫 서브는 <b>"Zero, Zero, Two"</b>로 시작해요. 처음 공격하는
          팀은 <b>서브권이 1개</b>뿐이라 두 번째(Two)부터 시작해요.
        </RuleItem>
        <RuleItem>
          이기면 <b>+1점</b>, 자리 바꿔 같은 사람이 또 서브해요.
        </RuleItem>
        <RuleItem>
          지면 서브권이 하나 줄어 <b>2번</b>이, 서브권을 다 쓰면{" "}
          <b>상대 팀</b>이 서브해요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 7",
    title: "바운스와 발리",
    Figure: BounceVolleyFigure,
    stillSeconds: 4.8,
    body: (
      <RuleList>
        <RuleItem>
          내 코트에 공이 <b>한 번 바운스한 뒤</b> 쳐도 되고,{" "}
          <b>바운스하기 전에 바로</b> 쳐도 돼요.
        </RuleItem>
        <RuleItem>
          바운스 전에 공중에서 바로 치는 걸 <b>발리</b>라고 해요.
        </RuleItem>
        <RuleItem>
          내가 친 공이 <b>상대 코트에 바운스된 뒤</b> 상대가 치기 전에{" "}
          <b>한 번 더 바운스되면</b> 이겨요. 두 번째 바운스는 코트 밖이어도
          돼요.
        </RuleItem>
        <RuleItem tone="fault">
          내가 친 공이 <b>코트 밖으로 나가면</b> 내가 져요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 8",
    title: "투바운스 룰",
    Figure: TwoBounceFigure,
    stillSeconds: 6,
    body: (
      <div className="flex flex-col gap-3">
        <p className="text-pk-15 leading-[1.5] text-pk-ink">
          서브 후 <b>두 번 바운스된 뒤부터</b> 발리할 수 있어요.
        </p>
        <TeamRuleRow team="attack">
          수비팀이 리턴한 공이 <b>바운스된 뒤에</b> 칠 수 있어요. 그다음부턴
          발리해도 돼요.
        </TeamRuleRow>
        <TeamRuleRow team="defense">
          공격팀이 서브한 공이 <b>바운스된 뒤에</b> 칠 수 있어요. 그다음부턴
          발리해도 돼요.
        </TeamRuleRow>
      </div>
    ),
  },
  {
    eyebrow: "규칙 9",
    title: "논 발리 존에선 발리 금지",
    Figure: NonVolleyZoneFigure,
    stillSeconds: 3.6,
    body: (
      <RuleList>
        <RuleItem>
          네트 양쪽의 <b>바닥 구역</b>이에요. 라인도 논 발리 존이에요.
        </RuleItem>
        <RuleItem tone="fault">
          논 발리 존을 밟고 발리하면 <b>폴트</b>. 발리를 한 뒤 논 발리 존을
          밟아도 <b>폴트</b>예요.
        </RuleItem>
        <RuleItem>
          공이 <b>한 번 바운스됐다면</b> 논 발리 존 안에서 쳐도 돼요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "규칙 10",
    title: "라인에 닿으면 인",
    Figure: LineCallFigure,
    stillSeconds: 5.5,
    body: (
      <RuleList>
        <RuleItem>
          공이 라인에 <b>조금이라도</b> 닿으면 인이에요.
        </RuleItem>
        <RuleItem tone="fault">
          예외로 <b>서브</b>가 <b>논 발리 존 라인</b>에 닿으면 폴트예요.
        </RuleItem>
        <RuleItem>
          판정은 <b>공이 떨어진 쪽</b> 팀이 해요. 애매하면 인으로 줘요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    eyebrow: "에티켓",
    title: "함께 치는 매너",
    Figure: EtiquetteFigure,
    stillSeconds: 2,
    body: (
      // et-r{n}: 그림이 n번째 사진을 보이는 동안 그 줄만 연한 파랑 바탕이다
      <div className="flex flex-col gap-1">
        {ETIQUETTE_ROWS.map((row, index) => (
          <RuleTableRow
            key={row.label}
            label={row.label}
            className={`et-row et-r${index + 1} min-h-10 [&>span:last-child]:leading-[1.45]`}
          >
            {row.body}
          </RuleTableRow>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "피카피카 규칙",
    title: "피카피카는 이렇게 쳐요",
    stillSeconds: 1,
    body: (
      // 줄이 0.12초 간격으로 차례로 떠오른다(c8-row)
      <div className="divide-y divide-pk-divider">
        {PIKAPIKA_ROWS.map((row, index) => (
          <RuleTableRow
            key={row.label}
            label={row.label}
            className="c8-row min-h-14 py-2.5"
            style={{ animationDelay: `${220 + index * 120}ms` }}
          >
            {row.body}
          </RuleTableRow>
        ))}
      </div>
    ),
  },
];
