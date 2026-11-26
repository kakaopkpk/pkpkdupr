import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 13장 그림: 엣지 케이스. 움직임은 rulesGuide.css의 .g2 .n4 .d5 범위다.
 * 장면: "라인에 조금이라도 닿으면 인" → "네트에 맞고 들어간 서브는 다시" → "바운스시켜 서브해도 돼요 = 드롭 서브" → "서브가 논 발리 존 라인에 닿으면 폴트"
 */
export const EdgeCaseFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="엣지 케이스 네 장면: 라인에 닿은 공은 인, 네트에 맞고 들어간 서브는 다시 서브, 바운스시켜 치는 드롭 서브는 허용, 서브가 논 발리 존 라인에 닿으면 폴트" style={{ position: "absolute", left: "0px", top: "6px" }}>
      <g className="sc s1">
        <rect x="0" y="48" width="138" height="96" fill="#2346a8" />
        <rect x="138" y="48" width="14" height="96" fill="#ffffff" />
        <text x="69" y="164" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">코트 안</text>
        <text x="145" y="164" fontSize="12" fontWeight="700" fill="#2346a8" textAnchor="middle">라인</text>
        <text x="232" y="164" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">코트 밖</text>
        <g transform="translate(96 96)">
          <g className="pop pop20">
            <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
          </g>
        </g>
        <g transform="translate(158 96)">
          <g className="pop pop40">
            <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
          </g>
        </g>
        <g transform="translate(232 96)">
          <g className="pop pop60">
            <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
          </g>
        </g>
        <text className="pop pop24" x="96" y="186" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">인</text>
        <text className="pop pop44" x="158" y="186" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">인</text>
        <g transform="translate(232 96)">
          <circle className="pop pop64" r="17" fill="none" stroke="#c2253d" strokeWidth="3" />
        </g>
      </g>
      <g className="sc s2">
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
            <g className="sw10">
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
            <g className="">
              <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
              <g transform="translate(12 7) rotate(-52)">
                <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
                <rect x="7" y="-7" width="17" height="14" rx="6" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(149 127)">
          <circle className="ring ring30" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(205 165)">
          <ellipse className="ring ring52" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(66 112)">
          <g className="hit hit10">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(149 88)">
          <g className="pop pop56">
            <rect x="-32.0" y="-12" width="64" height="24" rx="12" fill="#ffffff" />
            <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">다시 서브</text>
          </g>
        </g>
        <g className="kec2-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kec2">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s3">
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
            <g className="sw30">
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
            <g className="">
              <path d="M0 0 L12 7" stroke="#0f1726" strokeWidth="4" strokeLinecap="round" fill="none" />
              <g transform="translate(12 7) rotate(-52)">
                <path d="M0 0 L8 0" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
                <rect x="7" y="-7" width="17" height="14" rx="6" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </g>
          </g>
        </g>
        <g transform="translate(66 165)">
          <ellipse className="ring ring18" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <text className="pop pop18" x="66" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">바운스</text>
        <g transform="translate(226 165)">
          <ellipse className="ring ring56" rx="12" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
        <g transform="translate(66 118)">
          <g className="hit hit30">
            <circle r="11" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g className="kec3-sh">
          <ellipse rx="8" ry="2.6" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kec3">
          <circle r="6" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.2" />
        </g>
      </g>
      <g className="sc s4">
        <rect x="0" y="48" width="138" height="96" fill="#5a7bd6" />
        <rect x="138" y="48" width="14" height="96" fill="#ffffff" />
        <rect x="152" y="48" width="146" height="96" fill="#2346a8" />
        <text x="69" y="164" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">논 발리 존</text>
        <text x="145" y="164" fontSize="12" fontWeight="700" fill="#2346a8" textAnchor="middle">라인</text>
        <text x="225" y="164" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">서비스 코트</text>
        <g transform="translate(145 96)">
          <g className="pop pop30">
            <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
          </g>
        </g>
        <g transform="translate(145 96)">
          <circle className="pop pop45" r="17" fill="none" stroke="#c2253d" strokeWidth="3" />
        </g>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>라인에 조금이라도 닿으면 인</span>
    </div>
    <div className="cap sc s2">
      <span>네트에 맞고 들어간 서브는 다시</span>
    </div>
    <div className="cap sc s3">
      <span>바운스시켜 서브해도 돼요 = 드롭 서브</span>
    </div>
    <div className="cap sc s4 bad">
      <span>서브가 논 발리 존 라인에 닿으면 폴트</span>
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
      <span className="bar b4">
        <i />
      </span>
    </div>
  </RuleFigure>
);
