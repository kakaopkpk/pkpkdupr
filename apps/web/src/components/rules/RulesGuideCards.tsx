import React from "react";
import { BounceVolleyFigure } from "./figures/BounceVolleyFigure";
import { CourtTermsFigure } from "./figures/CourtTermsFigure";
import { EdgeCaseFigure } from "./figures/EdgeCaseFigure";
import { EtiquetteFigure } from "./figures/EtiquetteFigure";
import { GameWalkthroughFigure } from "./figures/GameWalkthroughFigure";
import { NonVolleyZoneFigure } from "./figures/NonVolleyZoneFigure";
import { RallyFigure } from "./figures/RallyFigure";
import { RallyOutcomeFigure } from "./figures/RallyOutcomeFigure";
import { ScoreCallFigure } from "./figures/ScoreCallFigure";
import { ScoringFigure } from "./figures/ScoringFigure";
import { ServeFigure } from "./figures/ServeFigure";
import { ServeRightFigure } from "./figures/ServeRightFigure";
import { TwoBounceFigure } from "./figures/TwoBounceFigure";
import { WinConditionFigure } from "./figures/WinConditionFigure";
import {
  RuleItem,
  RuleList,
  RuleParagraph,
  RuleTableRow,
} from "./RulesGuideParts";

/** 카드 묶음. 규칙 12장은 개요 → 치는 법 → 서브 → 정리이고, 그 뒤에 부록이 온다 */
type RulesGuideSection = "개요" | "치는 법" | "서브" | "정리" | "부록";

/** 카드 한 장. 화면이 그림 → 머리(eyebrow·title) → body 순서로 그린다 */
export interface RulesGuideCard {
  section: RulesGuideSection;
  /** 작은 머리 글자. 묶음 이름과 묶음 안 순번("치는 법 2/4")이고, 한 장뿐인 묶음은 이름만이다 */
  eyebrow: string;
  title: string;
  /** 그림 움직임 범위 클래스(rulesGuide.css). 카드 article에 붙는다 */
  scope: string;
  /** 위 그림. 없으면 머리부터 시작한다 */
  Figure?: React.FC;
  body: React.ReactNode;
  /** 움직임 줄이기면 멈춰 보일 장면(한 바퀴 안의 초) */
  stillSeconds: number;
}

type CardContent = Omit<RulesGuideCard, "eyebrow">;

const ETIQUETTE_ROWS: readonly { label: string; body: React.ReactNode }[] = [
  {
    label: "서브 전",
    body: (
      <>
        <b>상대가 준비됐는지</b> 확인하고 점수를 크게 부르고 서브해요
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
    label: "마무리 인사",
    body: (
      <>
        경기가 끝나면 네트에서 <b>패들을 맞대고</b> 인사해요
      </>
    ),
  },
];

const PIKAPIKA_ROWS: readonly { label: string; body: React.ReactNode }[] = [
  {
    label: "참여",
    body: (
      <>
        나올 날엔 앱 일정에서 미리 <b>참여</b>를 눌러 알려요
      </>
    ),
  },
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

/** 규칙 12장 */
const RULE_CARDS: readonly CardContent[] = [
  {
    title: "네트 너머로 공을 주고받아요",
    section: "개요",
    scope: "g2",
    Figure: RallyFigure,
    stillSeconds: 1.25,
    body: (
      <RuleList>
        <RuleItem>
          <b>두 명씩 한 팀</b>으로 네트를 사이에 두고 쳐요.
        </RuleItem>
        <RuleItem>
          처음 넘기는 공(서브)부터 누군가 실수할 때까지가 <b>랠리</b>예요.
        </RuleItem>
        <RuleItem>
          랠리를 이겨서 <b>점수</b>를 쌓아요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "승리 조건",
    section: "개요",
    scope: "pk-rules-c1",
    Figure: WinConditionFigure,
    stillSeconds: 3.6,
    body: (
      <RuleList>
        <RuleItem>
          <b>11점</b>을 먼저 내면 이겨요.
        </RuleItem>
        <RuleItem>
          단, <b>2점 차 이상</b>이어야 해요. 10:10(<b>듀스</b>)이 되면 2점 차가
          날 때까지 이어가요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "코트 용어 세 가지",
    section: "개요",
    scope: "g2 n3 d4",
    Figure: CourtTermsFigure,
    stillSeconds: 2,
    body: (
      <RuleList scene>
        <RuleItem row="r1">
          <b>베이스라인</b>은 코트 맨 뒤 줄이에요.
        </RuleItem>
        <RuleItem row="r2">
          <b>논 발리 존</b>은 네트 앞 구역이에요(키친).
        </RuleItem>
        <RuleItem row="r3">
          <b>서비스 코트</b>는 그 뒤 두 칸이에요. 네트를 보고 서서
          오른쪽·왼쪽이에요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "바운스 뒤에, 또는 바로",
    section: "치는 법",
    scope: "g2 n2 a6",
    Figure: BounceVolleyFigure,
    stillSeconds: 3.6,
    body: (
      <RuleList scene>
        <RuleItem row="r1">
          공이 내 코트에 <b>한 번 바운스된 뒤</b> 쳐도 돼요.
        </RuleItem>
        <RuleItem row="r2">
          바운스 전에 <b>공중에서 바로</b> 쳐도 돼요. 이걸 <b>발리</b>라고
          해요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "논 발리 존에선 발리 금지",
    section: "치는 법",
    scope: "g2 n3 a6",
    Figure: NonVolleyZoneFigure,
    stillSeconds: 3.6,
    body: (
      <RuleList>
        <RuleItem>
          <b>논 발리 존</b>을 밟고서는 발리할 수 없어요. 라인을 밟아도
          마찬가지예요.
        </RuleItem>
        <RuleItem tone="fault">
          규칙을 어기는 것을 <b>폴트</b>라고 해요. 폴트하면 그 랠리를 져요.
          발리한 뒤에 밟아도 <b>폴트</b>예요.
        </RuleItem>
        <RuleItem>
          공이 <b>바운스됐다면</b> 안에서 쳐도 돼요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "투바운스 룰",
    section: "치는 법",
    scope: "g2 k6",
    Figure: TwoBounceFigure,
    stillSeconds: 9,
    body: (
      <>
        <RuleParagraph>
          랠리가 시작되고 <b>두 번째 바운스 이후</b>부터 발리할 수 있어요.
        </RuleParagraph>
        <RuleList>
          <RuleItem>
            서브를 받는 팀은 서브가 <b>바운스된 뒤에</b> 쳐요.
          </RuleItem>
          <RuleItem>
            서브한 팀도 돌아온 공(리턴)이 <b>바운스된 뒤에</b> 쳐요.
          </RuleItem>
          <RuleItem>그다음부터는 발리해도 돼요.</RuleItem>
        </RuleList>
      </>
    ),
  },
  {
    title: "랠리는 이렇게 이기고 져요",
    section: "치는 법",
    scope: "g2 n3 a6",
    Figure: RallyOutcomeFigure,
    stillSeconds: 3.6,
    body: (
      <>
        {/* 지는 줄은 첫째·둘째 장면(네트·아웃) 동안 강조된다(r12) */}
        <RuleList scene>
          <RuleItem tone="fault" row="r12">
            내가 친 공이 <b>상대 코트에 바운스하지 못하면</b> 져요. 네트에 걸려
            넘어가지 못하거나, 코트 밖에 떨어진 경우(아웃)예요.
          </RuleItem>
          <RuleItem row="r3">
            내가 친 공이 상대 코트에 <b>한 번 바운스된 뒤</b>, 상대가 치기 전에
            어디든 <b>또 바운스</b>되면 이겨요.
          </RuleItem>
        </RuleList>
        <RuleParagraph>
          상대가 친 공도 똑같이 따져요. <b>폴트</b>한 쪽도 그 랠리를 져요.
        </RuleParagraph>
      </>
    ),
  },
  {
    title: "서브는 대각선 코트로",
    section: "서브",
    scope: "pk-rules-c4",
    Figure: ServeFigure,
    stillSeconds: 12.6,
    body: (
      <RuleList>
        <RuleItem>
          랠리는 서브로 시작해요. <b>베이스라인 뒤</b>에서 <b>대각선</b> 서비스
          코트로 넣어요.
        </RuleItem>
        <RuleItem>
          공을 <b>허리 아래</b>에서 맞혀 아래에서 위로 쳐요.
        </RuleItem>
        <RuleItem tone="fault">
          <b>대각선 서비스 코트</b>에 들어가지 못하면 폴트. 서브는 한 번만
          쳐요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "서브권: 서브할 권리",
    section: "서브",
    scope: "g2 n3 d6",
    Figure: ServeRightFigure,
    stillSeconds: 4.5,
    body: (
      <>
        <RuleParagraph>
          서브할 권리를 <b>서브권</b>이라고 해요. 서브권을 가진 팀이{" "}
          <b>공격팀</b>, 받는 팀이 <b>수비팀</b>이에요. 공격팀은 서브권이{" "}
          <b>2개</b>예요(두 사람이 하나씩).
        </RuleParagraph>
        <RuleList scene>
          <RuleItem row="r1">
            <b>오른쪽</b> 사람이 <b>1번 서버</b>로 먼저 서브해요. 랠리를 지면
            서브권 하나를 잃어요.
          </RuleItem>
          <RuleItem row="r2">
            이어서 <b>2번 서버</b>가 그 자리에서 서브해요. 또 지면 남은
            서브권도 잃어요.
          </RuleItem>
          <RuleItem row="r3">
            서브권을 다 잃으면 상대 팀이 공격팀이 돼요. <b>사이드 아웃</b>
            이라고 해요.
          </RuleItem>
        </RuleList>
        <RuleParagraph>
          <span className="text-pk-13 text-pk-sub">
            노란 점은 남은 서브권이에요.
          </span>
        </RuleParagraph>
      </>
    ),
  },
  {
    title: "점수는 공격팀만",
    section: "서브",
    scope: "g2 n3 d65",
    Figure: ScoringFigure,
    stillSeconds: 4.5,
    body: (
      <>
        <RuleList scene>
          <RuleItem row="r1">
            <b>공격팀</b>이 랠리를 이기면 <b>1점</b>을 얻어요.
          </RuleItem>
          <RuleItem row="r2">
            득점하면 파트너와 <b>좌우를 바꿔</b> 같은 사람이 또 서브해요.
          </RuleItem>
          <RuleItem row="r3">
            지면 <b>서브권 하나</b>를 잃고 다음 사람이 서브해요.
          </RuleItem>
        </RuleList>
        <RuleParagraph>
          수비팀은 이겨도 점수가 없고 자리도 안 바꿔요. 사이드 아웃으로
          공격팀이 돼야 점수를 낼 수 있어요.
        </RuleParagraph>
      </>
    ),
  },
  {
    title: "서브 전에 점수 부르기",
    section: "서브",
    scope: "pk-rules-c5",
    Figure: ScoreCallFigure,
    stillSeconds: 5.2,
    body: (
      <RuleList>
        <RuleItem>
          서브하는 사람이 서브 전에 점수를 <b>영어로 크게</b> 불러요.
        </RuleItem>
        <RuleItem>
          <b>공격팀 점수 → 수비팀 점수 → 서브하는 사람 번호</b> 순서예요.
        </RuleItem>
        <RuleItem>
          4:2에서 1번이 서브하면 <b>"Four, Two, One"</b>이에요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "경기 시뮬레이션",
    section: "정리",
    scope: "pk-rules-c6",
    Figure: GameWalkthroughFigure,
    stillSeconds: 3.7,
    body: (
      <RuleList>
        <RuleItem>
          서브 전에 <b>공격팀 점수 → 수비팀 점수 → 서버 번호</b>를 불러요.
        </RuleItem>
        <RuleItem>
          처음 공격하는 팀은 <b>서브권이 1개</b>뿐이라 두 번째(Two)인{" "}
          <b>"Zero, Zero, Two"</b>로 시작해요.
        </RuleItem>
        <RuleItem>
          득점하면 <b>+1점</b>, 자리 바꿔 같은 사람이 또 서브해요.
        </RuleItem>
        <RuleItem>
          지면 서브권이 하나 줄고, 서브권이 없으면 <b>사이드 아웃</b>으로
          공수가 바뀌어요.
        </RuleItem>
        <RuleItem>
          새 공격팀은 <b>오른쪽</b> 자리 사람부터 서브해요.
        </RuleItem>
      </RuleList>
    ),
  },
];

/** 부록 3장 */
const APPENDIX_CARDS: readonly CardContent[] = [
  {
    title: "엣지 케이스",
    section: "부록",
    scope: "g2 n4 d5",
    Figure: EdgeCaseFigure,
    stillSeconds: 3.5,
    body: (
      <RuleList scene>
        <RuleItem row="r1">
          공이 라인에 <b>조금이라도</b> 닿으면 인이에요. 판정은 공이 떨어진 쪽
          팀이 하고, 애매하면 인으로 줘요.
        </RuleItem>
        <RuleItem row="r2">
          서브가 <b>네트에 맞고</b> 대각선 코트에 들어가면 <b>다시 서브</b>
          해요. 한 번 더 맞으면 폴트예요.
        </RuleItem>
        <RuleItem row="r3">
          공을 떨어뜨려 <b>바운스된 뒤</b> 서브해도 돼요(드롭 서브).
        </RuleItem>
        <RuleItem tone="fault" row="r4">
          서브가 <b>논 발리 존 라인</b>에 닿으면 폴트예요.
        </RuleItem>
      </RuleList>
    ),
  },
  {
    title: "함께 치는 매너",
    section: "부록",
    scope: "pk-rules-c11",
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
    title: "피카피카는 이렇게 쳐요",
    section: "부록",
    scope: "pk-rules-c12",
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

/** 규칙 장 수. 위치 점은 규칙과 부록 사이를 띄운다 */
export const RULES_GUIDE_RULE_COUNT = RULE_CARDS.length;

const CARDS = [...RULE_CARDS, ...APPENDIX_CARDS];

const eyebrowOf = (card: CardContent, index: number): string => {
  const sameSection = CARDS.filter(({ section }) => section === card.section);
  if (sameSection.length === 1) return card.section;
  const position =
    CARDS.slice(0, index).filter(({ section }) => section === card.section)
      .length + 1;
  return `${card.section} ${position}/${sameSection.length}`;
};

/** 신입 회원용 피클볼 기본 규칙 카드. 화면에서 이 순서대로 넘긴다 */
export const RULES_GUIDE_CARDS: readonly RulesGuideCard[] = CARDS.map(
  (card, index) => ({ ...card, eyebrow: eyebrowOf(card, index) }),
);
