import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 3장 그림: 코트 용어 세 가지. 움직임은 rulesGuide.css의 .g2 .n3 .d4 범위다.
 * 장면: "맨 뒤 줄 = 베이스라인" → "네트 앞 구역 = 논 발리 존" → "그 뒤 두 칸 = 서비스 코트"
 */
export const CourtTermsFigure: React.FC = () => (
  <RuleFigure>
    <svg width="298" height="206" viewBox="0 0 298 206" role="img" aria-label="위에서 본 코트: 맨 뒤 줄이 베이스라인, 네트 앞 구역이 논 발리 존, 그 뒤 좌우 두 칸이 서비스 코트" style={{ position: "absolute", left: "0px", top: "4px" }}>
      <rect x="17" y="50" width="264" height="120" fill="#2346a8" />
      <rect x="107" y="50" width="84" height="120" fill="#5a7bd6" />
      <rect x="17" y="50" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
      <path d="M107 50 V170 M191 50 V170 M17 110 H107 M191 110 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
      <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
      <g className="sc s1">
        <line className="pulse" x1="17" y1="50" x2="17" y2="170" stroke="#ffd54a" strokeWidth="5" strokeLinecap="round" />
        <line className="pulse" x1="281" y1="50" x2="281" y2="170" stroke="#ffd54a" strokeWidth="5" strokeLinecap="round" />
        <text x="17" y="194" fontSize="12" fontWeight="800" fill="#2346a8">베이스라인</text>
        <text x="281" y="194" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">베이스라인</text>
      </g>
      <g className="sc s2">
        <rect className="pulse" x="107" y="50" width="84" height="120" fill="#ffd54a" opacity=".9" />
        <line x1="149" y1="44" x2="149" y2="176" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <text x="149" y="194" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">논 발리 존 (네트 앞 구역)</text>
      </g>
      <g className="sc s3">
        <rect className="pulse" x="17" y="50" width="90" height="120" fill="none" stroke="#ffd54a" strokeWidth="4" />
        <rect className="pulse" x="191" y="50" width="90" height="120" fill="none" stroke="#ffd54a" strokeWidth="4" />
        <text x="62" y="84" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">왼쪽</text>
        <text x="62" y="144" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">오른쪽</text>
        <text x="236" y="84" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">오른쪽</text>
        <text x="236" y="144" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">왼쪽</text>
        <text x="149" y="194" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">서비스 코트 (네트를 보고 좌우)</text>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>맨 뒤 줄 = 베이스라인</span>
    </div>
    <div className="cap sc s2">
      <span>네트 앞 구역 = 논 발리 존</span>
    </div>
    <div className="cap sc s3">
      <span>그 뒤 두 칸 = 서비스 코트</span>
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
