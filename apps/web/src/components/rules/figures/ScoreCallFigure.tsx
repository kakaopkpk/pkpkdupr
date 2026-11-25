import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 5장 그림: 서브 전 점수 외치기. 움직임은 rulesGuide.css의 .pk-rules-c5 */
export const ScoreCallFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="210" viewBox="0 0 298 210" role="img" aria-label="위에서 본 코트: 서버가 서브 전에 공격팀 점수, 수비팀 점수, 서버 번호를 Four, Two, One으로 부른다" style={{ position: "absolute", left: "0", top: "0" }}>
        <rect x="17" y="46" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="46" width="84" height="120" fill="#5a7bd6" />
        <rect x="17" y="46" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 46 V166 M191 46 V166 M17 106 H107 M191 106 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <line x1="149" y1="40" x2="149" y2="172" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(272 76)">
          <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
          <text y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
            1
          </text>
        </g>
        <g transform="translate(272 136)">
          <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
          <text y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
            2
          </text>
        </g>
        <g transform="translate(24 136)">
          <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
        </g>
        <g transform="translate(24 76)">
          <circle r="11" fill="#ffffff" />
          <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
            2
          </text>
        </g>
        <g transform="translate(24 136)">
          <circle r="11" fill="#ffffff" />
          <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
            1
          </text>
        </g>
        <g transform="translate(236 80)">
          <circle className="pop c2-rp1" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(80 114)">
          <circle className="pop c2-rp2" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(228 128)">
          <circle className="pop c2-rp3" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <circle className="c2-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <rect className="c2-h1" x="99" y="176" width="34" height="28" rx="14" fill="#ffffff" />
        <rect className="c2-h2" x="165" y="176" width="34" height="28" rx="14" fill="#ffffff" />
        <text x="116" y="196" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">
          4
        </text>
        <text x="182" y="196" fontSize="22" fontWeight="800" fill="#4f5a70" textAnchor="middle">
          2
        </text>
        <text x="149" y="193" fontSize="18" fontWeight="800" fill="#4f5a70" textAnchor="middle">
          :
        </text>
        <text x="17" y="194" fontSize="12" fontWeight="800" fill="#2346a8">
          공격팀
        </text>
        <circle cx="62" cy="190" r="5" fill="#ffd54a" />
        <circle cx="75" cy="190" r="5" fill="#ffd54a" />
        <text x="281" y="194" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="end">
          수비팀
        </text>
      </svg>
      <div className="call">
        <span>
          <span className="w c2-w1">
            "Four,
          </span>
          <span className="w c2-w2">
            Two,
          </span>
          <span className="w c2-w3">
            One!"
          </span>
        </span>
      </div>
    </div>
  </RuleFigure>
);
