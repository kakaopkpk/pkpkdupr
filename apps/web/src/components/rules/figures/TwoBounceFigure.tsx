import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 8장 그림: 투 바운스 룰. 움직임은 rulesGuide.css의 .pk-rules-c8 */
export const TwoBounceFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="옆에서 본 코트: 서브는 상대 쪽에서 한 번, 리턴은 우리 쪽에서 한 번 바운스된 뒤 치고, 그다음부터 두 사람이 앞으로 나와 발리한다" style={{ position: "absolute", left: "0", top: "10px" }}>
        <rect x="8" y="160" width="282" height="8" fill="#2346a8" />
        <rect x="107" y="160" width="84" height="8" fill="#5a7bd6" />
        <rect x="147" y="126" width="4" height="34" fill="#4f5a70" />
        <line x1="142" y1="126" x2="156" y2="126" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g className="t-a">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="13" cy="123" rx="4" ry="6" fill="#2346a8" />
        </g>
        <g className="t-b">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L-10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="-13" cy="123" rx="4" ry="6" fill="#152a5e" />
        </g>
        <g transform="translate(232 160)">
          <g className="pop t-m1">
            <ellipse rx="10" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
            <circle cy="16" r="9" fill="#2346a8" />
            <text y="20" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">
              1
            </text>
          </g>
        </g>
        <g transform="translate(66 160)">
          <g className="pop t-m2">
            <ellipse rx="10" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
            <circle cy="16" r="9" fill="#5a7bd6" />
            <text y="20" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">
              2
            </text>
          </g>
        </g>
        <circle className="t-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <text x="30" y="194" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          공격팀
        </text>
        <text x="268" y="194" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          수비팀
        </text>
      </svg>
      <div className="cap t-cap1">
        <span>
          ① 수비팀은 서브가 한 번 바운스된 뒤에
        </span>
      </div>
      <div className="cap t-cap2">
        <span>
          ② 공격팀도 리턴이 한 번 바운스된 뒤에
        </span>
      </div>
      <div className="cap t-cap3">
        <span>
          두 번 바운스된 뒤부터 발리 OK
        </span>
      </div>
    </div>
  </RuleFigure>
);
