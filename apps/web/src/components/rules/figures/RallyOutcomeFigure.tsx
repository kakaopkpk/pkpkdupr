import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 7장 그림: 랠리는 이렇게 이기고 져요. 움직임은 rulesGuide.css의 .g2 .n3 .a6 범위다.
 * 장면: "네트에 걸려 못 넘어가면 져요" → "내 공이 코트 밖에 떨어지면 져요" → "상대가 못 치고 또 바운스되면 이겨요"
 */
export const RallyOutcomeFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg width="298" height="204" viewBox="0 0 298 204" role="img" aria-label="옆에서 본 코트: 왼쪽이 나, 오른쪽이 상대. 내가 친 공이 네트에 걸려 넘어가지 못하거나 코트 밖에 떨어지면 랠리를 지고, 상대 코트에 한 번 바운스된 뒤 상대가 치기 전에 또 바운스되면 랠리를 이긴다" style={{ position: "absolute", left: "0px", top: "4px" }}>
      <text x="44" y="56" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">나</text>
      <text x="242" y="56" fontSize="12" fontWeight="800" fill="#152a5e" textAnchor="middle">상대</text>
      <rect x="0" y="164" width="298" height="8" fill="#a9b8e0" />
      <rect x="16" y="164" width="254" height="8" fill="#2346a8" />
      <rect x="107" y="164" width="84" height="8" fill="#5a7bd6" />
      <rect x="146" y="134" width="6" height="30" fill="#ffffff" opacity=".55" />
      <path d="M146 140 H152 M146 146 H152 M146 152 H152 M146 158 H152 M149 134 V164" stroke="#4f5a70" strokeWidth="1" fill="none" />
      <rect x="144" y="131" width="10" height="4" rx="2" fill="#0f1726" />
      <g transform="translate(44 164)">
        <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M0 -50 L0 -27" stroke="#2346a8" strokeWidth="11" strokeLinecap="round" fill="none" />
        <circle cx="1" cy="-63" r="8" fill="#0f1726" />
        <g transform="translate(0 -50)">
          <g className="kr7L">
            <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
            <g transform="translate(12 7) rotate(-52)">
              <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
              <rect x="7" y="-7" width="17" height="14" rx="6" fill="#2346a8" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          </g>
        </g>
      </g>
      <g className="sc s2">
        <g className="k4b-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k4b">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g transform="translate(242 164) scale(-1 1)">
        <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M0 -50 L0 -27" stroke="#152a5e" strokeWidth="11" strokeLinecap="round" fill="none" />
        <circle cx="1" cy="-63" r="8" fill="#0f1726" />
        <g transform="translate(0 -50)">
          <g className="k7R">
            <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
            <g transform="translate(12 7) rotate(-52)">
              <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
              <rect x="7" y="-7" width="17" height="14" rx="6" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          </g>
        </g>
      </g>
      <g className="sc s1">
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(135 165)">
          <ellipse className="pop pop34" rx="11" ry="4" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(112 190)">
          <g className="pop pop36">
            <rect x="-36.0" y="-12" width="72" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#c2253d" textAnchor="middle">못 넘어감</text>
          </g>
        </g>
        <g className="k4a-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k4a">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s2">
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(281 165)">
          <ellipse className="pop pop40" rx="11" ry="4" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(270 190)">
          <g className="pop pop41">
            <rect x="-22.0" y="-12" width="44" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#c2253d" textAnchor="middle">아웃</text>
          </g>
        </g>
      </g>
      <g className="sc s3">
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(178 165)">
          <ellipse className="ring ring30" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(210 165)">
          <ellipse className="ring ring48" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(178 188)">
          <g className="pop pop30">
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">1</text>
          </g>
        </g>
        <g transform="translate(210 188)">
          <g className="pop pop48">
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">2</text>
          </g>
        </g>
        <g transform="translate(242 74)">
          <g className="pop pop52">
            <path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#c2253d" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <g className="kr7c-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kr7c">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
    </svg>
    <div className="cap sc s1 bad">
      <span>네트에 걸려 못 넘어가면 져요</span>
    </div>
    <div className="cap sc s2 bad">
      <span>내 공이 코트 밖에 떨어지면 져요</span>
    </div>
    <div className="cap sc s3">
      <span>상대가 못 치고 또 바운스되면 이겨요</span>
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
