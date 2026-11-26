import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 4장 그림: 바운스 뒤에, 또는 바로. 움직임은 rulesGuide.css의 .g2 .n2 .a6 범위다.
 * 장면: "한 번 바운스된 뒤에 쳐도 되고" → "바운스 전에 바로 쳐도 돼요 = 발리"
 */
export const BounceVolleyFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg width="298" height="204" viewBox="0 0 298 204" role="img" aria-label="옆에서 본 코트: 공이 한 번 바운스된 뒤 쳐도 되고, 바운스 전에 공중에서 바로 쳐도(발리) 된다" style={{ position: "absolute", left: "0px", top: "4px" }}>
      <rect x="0" y="164" width="298" height="8" fill="#a9b8e0" />
      <rect x="16" y="164" width="266" height="8" fill="#2346a8" />
      <rect x="107" y="164" width="84" height="8" fill="#5a7bd6" />
      <rect x="146" y="134" width="6" height="30" fill="#ffffff" opacity=".55" />
      <path d="M146 140 H152 M146 146 H152 M146 152 H152 M146 158 H152 M149 134 V164" stroke="#4f5a70" strokeWidth="1" fill="none" />
      <rect x="144" y="131" width="10" height="4" rx="2" fill="#0f1726" />
      <g transform="translate(44 164)">
        <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M0 -50 L0 -27" stroke="#2346a8" strokeWidth="11" strokeLinecap="round" fill="none" />
        <circle cx="1" cy="-63" r="8" fill="#0f1726" />
        <g transform="translate(0 -50)">
          <g className="k3L">
            <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
            <g transform="translate(12 7) rotate(-52)">
              <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
              <rect x="7" y="-7" width="17" height="14" rx="6" fill="#2346a8" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          </g>
        </g>
      </g>
      <g transform="translate(254 164) scale(-1 1)">
        <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M0 -50 L0 -27" stroke="#152a5e" strokeWidth="11" strokeLinecap="round" fill="none" />
        <circle cx="1" cy="-63" r="8" fill="#0f1726" />
        <g transform="translate(0 -50)">
          <g className="k3R">
            <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
            <g transform="translate(12 7) rotate(-52)">
              <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
              <rect x="7" y="-7" width="17" height="14" rx="6" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          </g>
        </g>
      </g>
      <g className="sc s1">
        <g transform="translate(96 165)">
          <ellipse className="ring ring30" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(206 165)">
          <ellipse className="ring ring64" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(96 188)">
          <g className="pop pop30">
            <rect x="-29.0" y="-12" width="58" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">바운스</text>
          </g>
        </g>
        <g transform="translate(232 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(66 112)">
          <g className="hit hit46">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g className="k3a-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k3a">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s2">
        <text className="pop pop20" x="96" y="192" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">바운스 없이 바로</text>
        <g transform="translate(44 78)">
          <g className="pop pop30">
            <rect x="-23.0" y="-12" width="46" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">발리</text>
          </g>
        </g>
        <g transform="translate(232 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(66 108)">
          <g className="hit hit30">
            <circle r="11" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g className="k3b-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k3b">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>한 번 바운스된 뒤에 쳐도 되고</span>
    </div>
    <div className="cap sc s2">
      <span>바운스 전에 바로 쳐도 돼요 = 발리</span>
    </div>
    <div className="bars">
      <span className="bar b1">
        <i />
      </span>
      <span className="bar b2">
        <i />
      </span>
    </div>
  </RuleFigure>
);
