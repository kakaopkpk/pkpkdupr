import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 1장 그림: 네트 너머로 공을 주고받아요. 움직임은 rulesGuide.css의 .g2 범위다.
 * 장면: "네트 너머로 공을 주고받아요"
 */
export const RallyFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg width="298" height="210" viewBox="0 0 298 210" role="img" aria-label="위에서 본 코트: 두 명씩 두 팀이 네트 너머로 공을 주고받는다" style={{ position: "absolute", left: "0px", top: "4px" }}>
      <rect x="17" y="50" width="264" height="120" fill="#2346a8" />
      <rect x="107" y="50" width="84" height="120" fill="#5a7bd6" />
      <rect x="17" y="50" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
      <path d="M107 50 V170 M191 50 V170 M17 110 H107 M191 110 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
      <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" />
      <path d="M149 177 V183" stroke="#4f5a70" strokeWidth="1.5" />
      <rect x="131" y="183" width="36" height="20" rx="10" fill="#ffffff" />
      <text x="149" y="197" fontSize="12" fontWeight="800" fill="#0f1726" textAnchor="middle">네트</text>
      <g transform="translate(232 88)">
        <circle className="bnc bn1" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
      </g>
      <g transform="translate(84 102)">
        <circle className="bnc bn2" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
      </g>
      <g transform="translate(226 132)">
        <circle className="bnc bn3" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
      </g>
      <g transform="translate(80 130)">
        <circle className="bnc bn4" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
      </g>
      <g transform="translate(24 140)">
        <g className="pad at1">
          <path d="M4 0 L11 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="10" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
        <circle r="10" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
      </g>
      <g transform="translate(37 140)">
        <circle className="hitT at1" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
      </g>
      <g transform="translate(24 80)">
        <g className="pad at2">
          <path d="M4 0 L11 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="10" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
        <circle r="10" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
      </g>
      <g transform="translate(37 80)">
        <circle className="hitT at2" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
      </g>
      <g transform="translate(272 80) scale(-1 1)">
        <g className="pad at3">
          <path d="M4 0 L11 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="10" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
        <circle r="10" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <g transform="translate(259 80)">
        <circle className="hitT at3" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
      </g>
      <g transform="translate(272 140) scale(-1 1)">
        <g className="pad at4">
          <path d="M4 0 L11 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="10" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
        <circle r="10" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <g transform="translate(259 140)">
        <circle className="hitT at4" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
      </g>
      <g className="k1-sh">
        <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
      </g>
      <g className="k1 tr2">
        <circle r="5" fill="#ffd54a" opacity=".18" />
      </g>
      <g className="k1 tr1">
        <circle r="5" fill="#ffd54a" opacity=".38" />
      </g>
      <g className="k1">
        <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
      </g>
    </svg>
    <div className="cap">
      <span>네트 너머로 공을 주고받아요</span>
    </div>
  </RuleFigure>
);
