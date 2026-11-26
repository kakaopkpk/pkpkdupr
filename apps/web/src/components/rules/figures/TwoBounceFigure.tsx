import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 6장 그림: 서브와 리턴은 바운스 뒤에. 움직임은 rulesGuide.css의 .g2 .n3 .d7 범위다.
 * 장면: "① 받는 팀은 서브가 바운스된 뒤에" → "② 서브한 팀도 리턴이 바운스된 뒤에" → "두 번 바운스된 뒤부터 발리 OK"
 */
export const TwoBounceFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg className="loop" width="298" height="204" viewBox="0 0 298 204" role="img" aria-label="옆에서 본 코트: 서브는 상대 쪽에서 한 번, 리턴은 우리 쪽에서 한 번 바운스된 뒤 치고, 그다음부터 두 사람이 앞으로 나와 발리한다" style={{ position: "absolute", left: "0px", top: "4px" }}>
      <rect x="0" y="164" width="298" height="8" fill="#a9b8e0" />
      <rect x="16" y="164" width="266" height="8" fill="#2346a8" />
      <rect x="107" y="164" width="84" height="8" fill="#5a7bd6" />
      <rect x="146" y="134" width="6" height="30" fill="#ffffff" opacity=".55" />
      <path d="M146 140 H152 M146 146 H152 M146 152 H152 M146 158 H152 M149 134 V164" stroke="#4f5a70" strokeWidth="1" fill="none" />
      <rect x="144" y="131" width="10" height="4" rx="2" fill="#0f1726" />
      <text x="30" y="199" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">서브한 팀</text>
      <text x="268" y="199" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">받는 팀</text>
      <g className="k6wL">
        <g transform="translate(44 164)">
          <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M0 -50 L0 -27" stroke="#2346a8" strokeWidth="11" strokeLinecap="round" fill="none" />
          <circle cx="1" cy="-63" r="8" fill="#0f1726" />
          <g transform="translate(0 -50)">
            <g className="k6L">
              <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
              <g transform="translate(12 7) rotate(-52)">
                <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
                <rect x="7" y="-7" width="17" height="14" rx="6" fill="#2346a8" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g className="k6wR">
        <g transform="translate(254 164) scale(-1 1)">
          <path d="M-1 -26 L-9 0 M1 -26 L9 0" stroke="#0f1726" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M0 -50 L0 -27" stroke="#152a5e" strokeWidth="11" strokeLinecap="round" fill="none" />
          <circle cx="1" cy="-63" r="8" fill="#0f1726" />
          <g transform="translate(0 -50)">
            <g className="k6R">
              <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
              <g transform="translate(12 7) rotate(-52)">
                <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
                <rect x="7" y="-7" width="17" height="14" rx="6" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <g className="sc s1">
        <g transform="translate(222 165)">
          <ellipse className="ring ring34" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(222 184)">
          <g className="pop pop34">
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">1</text>
          </g>
        </g>
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g className="k6a-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k6a">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s2">
        <g transform="translate(222 184)">
          <g>
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">1</text>
          </g>
        </g>
        <g transform="translate(76 165)">
          <ellipse className="ring ring34" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(76 184)">
          <g className="pop pop34">
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">2</text>
          </g>
        </g>
        <g transform="translate(232 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g className="k6b-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k6b">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s3">
        <g transform="translate(222 184)">
          <g>
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">1</text>
          </g>
        </g>
        <g transform="translate(76 184)">
          <g>
            <circle r="9" fill="#2346a8" />
            <text y="4" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">2</text>
          </g>
        </g>
        <g transform="translate(202 78)">
          <g className="pop pop30">
            <rect x="-23.0" y="-12" width="46" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">발리</text>
          </g>
        </g>
        <g transform="translate(96 78)">
          <g className="pop pop48">
            <rect x="-23.0" y="-12" width="46" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">발리</text>
          </g>
        </g>
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(180 110)">
          <g className="hit hit30">
            <circle r="11" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(118 110)">
          <g className="hit hit48">
            <circle r="11" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(180 110)">
          <g className="hit hit64">
            <circle r="11" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(118 110)">
          <g className="hit hit80">
            <circle r="11" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g className="k6c-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k6c">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>① 받는 팀은 서브가 바운스된 뒤에</span>
    </div>
    <div className="cap sc s2">
      <span>② 서브한 팀도 리턴이 바운스된 뒤에</span>
    </div>
    <div className="cap sc s3">
      <span>두 번 바운스된 뒤부터 발리 OK</span>
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
