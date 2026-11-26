import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 9장 그림: 서브권: 서브할 권리. 움직임은 rulesGuide.css의 .g2 .n3 .d6 범위다.
 * 장면: "1번 서버가 지면 서브권 하나를 잃어요" → "2번 서버가 지면 남은 서브권도 잃어요" → "사이드 아웃: 공수 전환"
 */
export const ServeRightFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg className="loop" width="298" height="206" viewBox="0 0 298 206" role="img" aria-label="위에서 본 코트: 공격팀 1번이 서브해서 랠리를 지면 서브권 하나를 잃고, 2번도 지면 서브권이 상대 팀으로 넘어가 공수가 바뀐다(사이드 아웃). 노란 점은 남은 서브권" style={{ position: "absolute", left: "0px", top: "0px" }}>
      <rect x="17" y="46" width="264" height="120" fill="#2346a8" />
      <rect x="107" y="46" width="84" height="120" fill="#5a7bd6" />
      <rect x="17" y="46" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
      <path d="M107 46 V166 M191 46 V166 M17 106 H107 M191 106 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
      <line x1="149" y1="40" x2="149" y2="172" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
      <g transform="translate(24 136)">
        <g className="p9-swl1">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(24 136)">
        <circle r="11" fill="#ffffff" />
      </g>
      <g transform="translate(24 76)">
        <g className="p9-swl2">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(24 76)">
        <circle r="11" fill="#ffffff" />
      </g>
      <g transform="translate(272 76) scale(-1 1)">
        <g className="p9-swr1">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(272 76)">
        <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <g transform="translate(272 136) scale(-1 1)">
        <g className="p9-swr2">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(272 136)">
        <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <text className="f-nl" x="24" y="140" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">1</text>
      <text className="f-nl" x="24" y="80" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">2</text>
      <text className="f-nr" x="272" y="80" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">1</text>
      <text className="f-nr" x="272" y="140" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">2</text>
      <g className="f-sr">
        <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
      </g>
      <text className="f-nl" x="17" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="start">공격팀</text>
      <text className="f-nl" x="281" y="190" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="end">수비팀</text>
      <text className="f-nr" x="17" y="190" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="start">수비팀</text>
      <text className="f-nr" x="281" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">공격팀</text>
      <g className="f-nl">
        <circle cx="62" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
        <circle cx="75" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
      </g>
      <circle className="f-p1" cx="62" cy="186" r="5" fill="#ffd54a" />
      <circle className="f-p2" cx="75" cy="186" r="5" fill="#ffd54a" />
      <g className="f-nr">
        <circle cx="236" cy="186" r="5" fill="#ffd54a" />
        <circle cx="223" cy="186" r="5" fill="#ffd54a" />
      </g>
      <g className="sc s1">
        <g transform="translate(236 82)">
          <circle className="ring ring25" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(80 100)">
          <circle className="ring ring47" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(214 182)">
          <circle className="pop pop68" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 136)">
          <circle className="tb-hit tb-hitD8" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(259 76)">
          <circle className="tb-hit tb-hitD31" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 76)">
          <circle className="tb-hit tb-hitD53" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g className="kh1-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kh1 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="kh1 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="kh1">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
      </g>
      <g className="sc s2">
        <g transform="translate(236 130)">
          <circle className="ring ring25" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(80 118)">
          <circle className="ring ring47" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(214 182)">
          <circle className="pop pop68" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 76)">
          <circle className="tb-hit tb-hitD8" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(259 136)">
          <circle className="tb-hit tb-hitD31" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 136)">
          <circle className="tb-hit tb-hitD53" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g className="kh2-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kh2 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="kh2 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="kh2">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>1번 서버가 지면 서브권 하나를 잃어요</span>
    </div>
    <div className="cap sc s2">
      <span>2번 서버가 지면 남은 서브권도 잃어요</span>
    </div>
    <div className="cap sc s3">
      <span>사이드 아웃: 공수 전환</span>
    </div>
    <div className="bars">
      <span className="bar b1">
        <i />
      </span>
      <span className="bar b2">
        <i />
      </span>
      <span className="bar b3">
        <i />
      </span>
    </div>
  </RuleFigure>
);
