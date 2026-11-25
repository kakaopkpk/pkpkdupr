import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 7장 그림: 바운스와 발리. 움직임은 rulesGuide.css의 .pk-rules-c7 */
export const BounceVolleyFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="200" viewBox="0 0 298 200" role="img" aria-label="옆에서 본 코트: 공이 한 번 바운스된 뒤 쳐도 되고, 바운스 전에 바로 쳐도(발리) 된다. 내가 친 공이 상대 코트에 바운스된 뒤 상대가 치기 전에 한 번 더 바운스되면 내가 이기고, 코트 밖으로 나가면 내가 진다" style={{ position: "absolute", left: "0", top: "10px" }}>
        <rect x="0" y="160" width="20" height="8" fill="#a9b8e0" />
        <rect x="278" y="160" width="20" height="8" fill="#a9b8e0" />
        <rect x="20" y="160" width="258" height="8" fill="#2346a8" />
        <rect x="107" y="160" width="84" height="8" fill="#5a7bd6" />
        <rect x="147" y="126" width="4" height="34" fill="#4f5a70" />
        <line x1="142" y1="126" x2="156" y2="126" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(40 0)">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="13" cy="123" rx="4" ry="6" fill="#2346a8" />
        </g>
        <g transform="translate(262 0)">
          <circle cy="118" r="6" fill="#0f1726" />
          <path d="M0 124 V146 M0 146 L-6 160 M0 146 L6 160 M0 132 L-10 126" stroke="#0f1726" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <ellipse cx="-13" cy="123" rx="4" ry="6" fill="#152a5e" />
        </g>
        <g transform="translate(100 160)">
          <g className="pop v-m0">
            <ellipse rx="10" ry="4" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(52 124)">
          <g className="pop v-ok1">
            <circle r="16" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(54 116)">
          <g className="pop v-ok2">
            <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(196 176)">
          <g className="pop v-n1">
            <circle r="9" fill="#ffffff" />
            <text y="4" fontSize="11" fontWeight="800" fill="#2346a8" textAnchor="middle">
              1
            </text>
          </g>
        </g>
        <g transform="translate(228 176)">
          <g className="pop v-n2">
            <circle r="9" fill="#ffffff" />
            <text y="4" fontSize="11" fontWeight="800" fill="#2346a8" textAnchor="middle">
              2
            </text>
          </g>
        </g>
        <g transform="translate(42 134)">
          <g className="pop v-win">
            <circle r="24" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(287 160)">
          <g className="pop v-out">
            <ellipse rx="9" ry="4" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
        </g>
        <g transform="translate(40 100)">
          <g className="pop v-x">
            <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#c2253d" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
        <circle className="v-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        <text x="288" y="188" fontSize="11" fontWeight="700" fill="#4f5a70" textAnchor="middle">
          밖
        </text>
      </svg>
      <div className="cap v-cap1">
        <span>
          한 번 바운스된 뒤 쳐도 OK
        </span>
      </div>
      <div className="cap v-cap2">
        <span>
          바운스 전에 바로 쳐도 OK = 발리
        </span>
      </div>
      <div className="cap v-cap3">
        <span>
          상대가 치기 전에 또 바운스되면 이겨요
        </span>
      </div>
      <div className="cap bad v-cap4">
        <span>
          내가 친 공이 코트 밖으로 나가면 져요
        </span>
      </div>
    </div>
  </RuleFigure>
);
