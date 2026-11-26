import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 10장 그림: 점수는 공격팀만. 움직임은 rulesGuide.css의 .g2 .n3 .d65 범위다.
 * 장면: "공격팀이 이기면 +1점" → "득점하면 좌우를 바꿔 또 서브" → "지면 서브권 하나를 잃어요"
 */
export const ScoringFigure: React.FC = () => (
  <RuleFigure className="g3">
    <svg className="loop" width="298" height="206" viewBox="0 0 298 206" role="img" aria-label="위에서 본 코트: 공격팀이 랠리를 이기면 1점을 얻고, 파트너와 좌우를 바꿔 같은 사람이 왼쪽에서 또 서브한다. 지면 서브권 하나를 잃는다" style={{ position: "absolute", left: "0px", top: "0px" }}>
      <rect x="17" y="46" width="264" height="120" fill="#2346a8" />
      <rect x="107" y="46" width="84" height="120" fill="#5a7bd6" />
      <rect x="17" y="46" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
      <path d="M107 46 V166 M191 46 V166 M17 106 H107 M191 106 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
      <line x1="149" y1="40" x2="149" y2="172" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
      <g transform="translate(272 76) scale(-1 1)">
        <g className="p10-swr1">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(272 76)">
        <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <g transform="translate(272 136) scale(-1 1)">
        <g className="p10-swr2">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      </g>
      <g transform="translate(272 136)">
        <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <text className="" x="17" y="190" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="start">공격팀</text>
      <text className="" x="281" y="190" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="end">수비팀</text>
      <circle cx="62" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
      <circle className="m-p1" cx="62" cy="186" r="5" fill="#ffd54a" />
      <circle cx="75" cy="186" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
      <circle className="" cx="75" cy="186" r="5" fill="#ffd54a" />
      <text x="182" y="192" fontSize="22" fontWeight="800" fill="#4f5a70" textAnchor="middle">2</text>
      <text x="149" y="189" fontSize="18" fontWeight="800" fill="#4f5a70" textAnchor="middle">:</text>
      <text className="m-3" x="116" y="192" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">3</text>
      <text className="m-4" x="116" y="192" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">4</text>
      <g className="sc s1">
        <g transform="translate(236 82)">
          <circle className="ring ring25" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(6 106)">
          <circle className="pop pop47" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 136)">
          <circle className="tb-hit tb-hitD8" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(259 76)">
          <circle className="tb-hit tb-hitD31" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g className="ke1-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="ke1 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="ke1 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="ke1">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <text className="pop pop52" x="103" y="188" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">+1</text>
      </g>
      <g className="sc s2">
        <g className="pop pop50">
          <rect x="17" y="46" width="90" height="60" fill="#ffffff" opacity=".28" />
          <rect x="191" y="106" width="90" height="60" fill="#ffffff" opacity=".28" />
          <text x="72" y="62" fontSize="11" fontWeight="800" fill="#ffffff" textAnchor="middle">왼쪽</text>
          <path d="M42 82 L222 125" stroke="#ffd54a" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" fill="none" />
          <polygon points="230,127 219.1,129.6 221.4,119.8" fill="#ffd54a" />
        </g>
      </g>
      <g className="sc s3">
        <g transform="translate(236 130)">
          <circle className="ring ring25" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(80 118)">
          <circle className="ring ring47" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
        </g>
        <g transform="translate(214 182)">
          <circle className="pop pop68" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 76)">
          <circle className="tb-hit tb-hitD8" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(259 136)">
          <circle className="tb-hit tb-hitD31" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g transform="translate(37 136)">
          <circle className="tb-hit tb-hitD53" r="9" fill="none" stroke="#ffd54a" strokeWidth="2.5" />
        </g>
        <g className="kh2-sh">
          <ellipse rx="5" ry="3" fill="#0f1726" opacity=".3" />
        </g>
        <g className="kh2 tr2">
          <circle r="5" fill="#ffd54a" opacity=".18" />
        </g>
        <g className="kh2 tr1">
          <circle r="5" fill="#ffd54a" opacity=".38" />
        </g>
        <g className="kh2">
          <circle r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
      </g>
      <g className="m2">
        <g className="p10-swm2">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
        <circle r="11" fill="#ffffff" />
        <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">2</text>
      </g>
      <g className="m1">
        <g className="p10-swm1">
          <path d="M5 0 L12 0" stroke="#0f1726" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="11" y="-5" width="11" height="10" rx="4" fill="#ffffff" stroke="#0f1726" strokeWidth="1.5" />
        </g>
        <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
        <circle r="11" fill="#ffffff" />
        <text y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">1</text>
      </g>
    </svg>
    <div className="cap sc s1">
      <span>공격팀이 이기면 +1점</span>
    </div>
    <div className="cap sc s2">
      <span>득점하면 좌우를 바꿔 또 서브</span>
    </div>
    <div className="cap sc s3">
      <span>지면 서브권 하나를 잃어요</span>
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
