import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 8장 그림: 서브는 대각선 코트로. 움직임은 rulesGuide.css의 .pk-rules-c4 범위다
 */
export const ServeFigure: React.FC = () => (
  <RuleFigure className="g3">
    <div className="scene" style={{ position: "absolute", inset: "0px" }}>
      <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="위에서 본 코트: 대각선 서비스 코트에 들어간 서브는 성공, 논 발리 존·대각선이 아닌 코트·코트 밖에 떨어진 서브는 폴트" style={{ position: "absolute", left: "0px", top: "10px" }}>
        <rect x="17" y="50" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="50" width="84" height="120" fill="#5a7bd6" />
        <rect className="c4-kflash" x="149" y="50" width="42" height="120" fill="#c2253d" />
        <rect className="c4-wflash" x="191" y="110" width="90" height="60" fill="#c2253d" />
        <rect className="c4-target" x="191" y="50" width="90" height="60" fill="#ffffff" />
        <rect x="17" y="50" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 50 V170 M191 50 V170 M17 110 H107 M191 110 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(10 140)">
          <g className="k5sw">
            <path d="M4 0 L11 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="10" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
          </g>
          <circle r="10" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
        <g transform="translate(23 140)">
          <circle className="tb-hit tb-hitc45" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(23 140)">
          <circle className="tb-hit tb-hitc428" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(23 140)">
          <circle className="tb-hit tb-hitc452" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(23 140)">
          <circle className="tb-hit tb-hitc476" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
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
        <g className="k5b1-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k5b1 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="k5b1 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="k5b1">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <g className="k5b2-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k5b2 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="k5b2 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="k5b2">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <g className="k5b3-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k5b3 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="k5b3 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="k5b3">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <g className="k5b4-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="k5b4 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="k5b4 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="k5b4">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
      </svg>
      <div className="cap c4-cap1">
        <span>대각선 서비스 코트에 넣으면 성공</span>
      </div>
      <div className="cap bad c4-cap2">
        <span>논 발리 존에 떨어지면 폴트</span>
      </div>
      <div className="cap bad c4-cap3">
        <span>대각선이 아닌 코트면 폴트</span>
      </div>
      <div className="cap bad c4-cap4">
        <span>코트 밖으로 나가면 폴트</span>
      </div>
    </div>
  </RuleFigure>
);
