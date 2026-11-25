import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 2장 그림: 점수: 공격팀만 점수를 얻고 서브권이 두 번. 움직임은 rulesGuide.css의 .pk-rules-c2 */
export const ScoringFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="216" viewBox="0 0 298 216" role="img" aria-label="위에서 본 코트: 공격팀이 랠리를 이기면 1점을 얻는다. 공격팀은 서브 기회가 두 번이라, 지면 2번 서버가 서브하고, 2번도 지면 점수 없이 서브권이 상대 팀으로 넘어간다" style={{ position: "absolute", left: "0", top: "0" }}>
        <rect x="17" y="46" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="46" width="84" height="120" fill="#5a7bd6" />
        <rect x="17" y="46" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 46 V166 M191 46 V166 M17 106 H107 M191 106 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <line x1="149" y1="40" x2="149" y2="172" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <text className="c1-r1" x="17" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="start">
          공격팀
        </text>
        <text className="c1-r2" x="17" y="190" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="start">
          수비팀
        </text>
        <text className="c1-r2" x="281" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">
          공격팀
        </text>
        <text className="c1-r1" x="281" y="190" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="end">
          수비팀
        </text>
        <g className="c1-pipsL">
          <circle cx="62" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
          <circle className="pop c1-p1" cx="62" cy="186" r="5" fill="#ffd54a" />
          <circle cx="75" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
          <circle className="pop c1-p2" cx="75" cy="186" r="5" fill="#ffd54a" />
        </g>
        <g className="c1-pipsR">
          <circle cx="236" cy="186" r="5" fill="#ffd54a" />
          <circle cx="223" cy="186" r="5" fill="#ffd54a" />
        </g>
        <g transform="translate(0 -4)">
          <g transform="translate(272 80)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              1
            </text>
          </g>
          <g transform="translate(272 140)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              2
            </text>
          </g>
          <g className="c1-ring">
            <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
          </g>
          <g className="c1-b">
            <circle r="11" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              1
            </text>
          </g>
          <g className="c1-c">
            <circle r="11" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              2
            </text>
          </g>
          <g transform="translate(236 86)">
            <circle className="pop c1-rp1" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 118)">
            <circle className="pop c1-rp2" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(230 140)">
            <circle className="pop c1-rp3" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(9 104)">
            <circle className="pop c1-rp4" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 136)">
            <circle className="pop c1-rp5" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(78 100)">
            <circle className="pop c1-rp6" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(289 116)">
            <circle className="pop c1-rp7" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 84)">
            <circle className="pop c1-rp8" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 124)">
            <circle className="pop c1-rp9" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(289 96)">
            <circle className="pop c1-rp10" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <circle className="c1-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <g transform="translate(116 192)">
          <text className="c1-s3" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">
            3
          </text>
          <text className="pop c1-s4" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">
            4
          </text>
        </g>
        <text className="c1-plus" x="100" y="188" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">
          +1
        </text>
        <text x="182" y="192" fontSize="22" fontWeight="800" fill="#4f5a70" textAnchor="middle">
          2
        </text>
        <text x="149" y="189" fontSize="18" fontWeight="800" fill="#4f5a70" textAnchor="middle">
          :
        </text>
        <text className="c1-same" x="149" y="208" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          점수 그대로
        </text>
      </svg>
      <div className="cap c1-cap1">
        <span>
          공격팀이 이기면 +1점
        </span>
      </div>
      <div className="cap c1-cap2">
        <span>
          지면 점수 그대로, 2번이 서브
        </span>
      </div>
      <div className="cap c1-cap3">
        <span>
          2번도 지면 서브권이 상대 팀에게
        </span>
      </div>
    </div>
  </RuleFigure>
);
