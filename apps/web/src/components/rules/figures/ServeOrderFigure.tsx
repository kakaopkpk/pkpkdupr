import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 3장 그림: 복식 서브 순서. 움직임은 rulesGuide.css의 .pk-rules-c3 */
export const ServeOrderFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="210" viewBox="0 0 298 210" role="img" aria-label="위에서 본 코트: 첫 서브는 오른쪽 코트에서 하고, 이기면 파트너와 자리를 바꾸고, 지면 파트너가, 또 지면 상대 팀이 서브한다" style={{ position: "absolute", left: "0", top: "4px" }}>
        <rect x="17" y="50" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="50" width="84" height="120" fill="#5a7bd6" />
        <rect x="17" y="50" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 50 V170 M191 50 V170 M17 110 H107 M191 110 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g>
          <g transform="translate(272 80)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text className="c3-on" y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              1
            </text>
          </g>
          <g transform="translate(272 140)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text className="c3-on" y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              2
            </text>
          </g>
          <g className="c3-ring">
            <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
          </g>
          <g className="c3-a">
            <circle r="11" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              1
            </text>
          </g>
          <g className="c3-b">
            <circle r="11" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              2
            </text>
          </g>
          <g transform="translate(236 84)">
            <circle className="pop c3-rp1" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(9 100)">
            <circle className="pop c3-rp2" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 136)">
            <circle className="pop c3-rp3" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 104)">
            <circle className="pop c3-rp4" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(289 120)">
            <circle className="pop c3-rp5" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 84)">
            <circle className="pop c3-rp6" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 124)">
            <circle className="pop c3-rp7" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(289 100)">
            <circle className="pop c3-rp8" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(62 138)">
            <circle className="pop c3-rp9" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(226 104)">
            <circle className="pop c3-rp10" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(90 88)">
            <circle className="pop c3-rp11" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <circle className="c3-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <rect x="38" y="180" width="66" height="20" rx="10" fill="#ffffff" />
        <text x="71" y="194" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          우리 1번
        </text>
        <rect className="c3-q1" x="38" y="180" width="66" height="20" rx="10" fill="#2346a8" />
        <text className="c3-q1" x="71" y="194" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
          우리 1번
        </text>
        <text x="114" y="194" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          →
        </text>
        <rect x="124" y="180" width="66" height="20" rx="10" fill="#ffffff" />
        <text x="157" y="194" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          우리 2번
        </text>
        <rect className="c3-q2" x="124" y="180" width="66" height="20" rx="10" fill="#2346a8" />
        <text className="c3-q2" x="157" y="194" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
          우리 2번
        </text>
        <text x="200" y="194" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          →
        </text>
        <rect x="210" y="180" width="66" height="20" rx="10" fill="#ffffff" />
        <text x="243" y="194" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          상대 1번
        </text>
        <rect className="c3-q3" x="210" y="180" width="66" height="20" rx="10" fill="#152a5e" />
        <text className="c3-q3" x="243" y="194" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
          상대 1번
        </text>
      </svg>
      <div className="cap c3-cap1">
        <span>
          첫 서브는 오른쪽 코트에서
        </span>
      </div>
      <div className="cap c3-cap2">
        <span>
          이기면 자리 바꿔 1번이 또 서브
        </span>
      </div>
      <div className="cap c3-cap3">
        <span>
          지면 2번이 서브
        </span>
      </div>
      <div className="cap c3-cap4">
        <span>
          또 지면 상대 1번이 오른쪽에서
        </span>
      </div>
    </div>
  </RuleFigure>
);
