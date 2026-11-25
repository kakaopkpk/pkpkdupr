import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 4장 그림: 서브는 대각선 코트로. 움직임은 rulesGuide.css의 .pk-rules-c4 */
export const ServeFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="위에서 본 코트: 대각선 서비스 코트에 들어간 서브는 성공, 논 발리 존·대각선이 아닌 코트·코트 밖에 떨어진 서브는 폴트" style={{ position: "absolute", left: "0", top: "10px" }}>
        <rect x="17" y="50" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="50" width="84" height="120" fill="#5a7bd6" />
        <rect className="c4-kflash" x="149" y="50" width="42" height="120" fill="#c2253d" />
        <rect className="c4-wflash" x="191" y="110" width="90" height="60" fill="#c2253d" />
        <rect className="c4-target" x="191" y="50" width="90" height="60" fill="#ffffff" />
        <rect x="17" y="50" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 50 V170 M191 50 V170 M17 110 H107 M191 110 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <text x="149" y="188" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          가운데 두 칸 = 논 발리 존
        </text>
        <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(10 140)">
          <circle r="9" fill="#ffffff" />
          <text y="4" fontSize="11" fontWeight="800" fill="#2346a8" textAnchor="middle">
            1
          </text>
        </g>
        <g transform="translate(235 80)">
          <g className="pop c4-ok">
            <circle r="13" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(172 74)">
          <g className="pop c4-x1">
            <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(235 140)">
          <g className="pop c4-x2">
            <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(289 62)">
          <g className="pop c4-x3">
            <path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#c2253d" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <circle className="c4-ball1" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <circle className="c4-ball2" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <circle className="c4-ball3" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <circle className="c4-ball4" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
      </svg>
      <div className="cap c4-cap1">
        <span>
          대각선 서비스 코트에 넣으면 성공
        </span>
      </div>
      <div className="cap bad c4-cap2">
        <span>
          논 발리 존에 떨어지면 폴트
        </span>
      </div>
      <div className="cap bad c4-cap3">
        <span>
          대각선이 아닌 코트면 폴트
        </span>
      </div>
      <div className="cap bad c4-cap4">
        <span>
          코트 밖으로 나가면 폴트
        </span>
      </div>
    </div>
  </RuleFigure>
);
