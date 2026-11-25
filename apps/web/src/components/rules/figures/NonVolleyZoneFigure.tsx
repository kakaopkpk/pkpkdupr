import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 9장 그림: 논 발리 존. 움직임은 rulesGuide.css의 .pk-rules-c9 */
export const NonVolleyZoneFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="옆에서 본 코트: 논 발리 존 밖에서 발리는 괜찮고, 안에 들어가 발리하면 폴트, 논 발리 존에 바운스된 공은 들어가서 쳐도 된다" style={{ position: "absolute", left: "0", top: "10px" }}>
        <rect x="8" y="160" width="282" height="8" fill="#2346a8" />
        <rect x="107" y="160" width="84" height="8" fill="#5a7bd6" />
        <rect className="n-flash" x="107" y="160" width="42" height="8" fill="#c2253d" />
        <rect x="147" y="126" width="4" height="34" fill="#4f5a70" />
        <line x1="142" y1="126" x2="156" y2="126" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(262 0)">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L-10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="-13" cy="123" rx="4" ry="6" fill="#152a5e" />
        </g>
        <g className="n-p">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="13" cy="123" rx="4" ry="6" fill="#2346a8" />
        </g>
        <g transform="translate(96 122)">
          <g className="pop n-ok1">
            <circle r="16" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(122 98)">
          <g className="pop n-x">
            <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#c2253d" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(126 160)">
          <g className="pop n-b">
            <ellipse rx="10" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(133 126)">
          <g className="pop n-ok3">
            <circle r="16" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <circle className="n-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <text x="149" y="188" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          ← 논 발리 존 →
        </text>
      </svg>
      <div className="cap n-cap1">
        <span>
          논 발리 존 밖에서 발리 OK
        </span>
      </div>
      <div className="cap bad n-cap2">
        <span>
          논 발리 존 안에서 발리하면 폴트
        </span>
      </div>
      <div className="cap n-cap3">
        <span>
          논 발리 존에 바운스된 공은 들어가서 OK
        </span>
      </div>
    </div>
  </RuleFigure>
);
