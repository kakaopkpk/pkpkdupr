import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 10장 그림: 인·아웃과 폴트. 움직임은 rulesGuide.css의 .pk-rules-c10 */
export const LineCallFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="298" height="180" viewBox="0 0 298 180" role="img" aria-label="위에서 본 라인: 코트 안과 라인에 닿은 공은 인, 바깥 공은 아웃. 서브가 논 발리 존 라인에 닿으면 폴트" style={{ display: "block" }}>
        <g className="c7-ga">
          <rect x="0" y="40" width="138" height="100" fill="#2346a8" />
          <rect x="138" y="40" width="14" height="100" fill="#ffffff" />
          <text x="69" y="28" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
            코트 안
          </text>
          <text x="145" y="28" fontSize="12" fontWeight="700" fill="#2346a8" textAnchor="middle">
            라인
          </text>
          <text x="235" y="28" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
            코트 밖
          </text>
          <g transform="translate(96 90)">
            <ellipse className="pop c7-s1" rx="11" ry="4" cy="12" fill="#0f1726" />
            <g className="pop c7-b1">
              <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
            </g>
          </g>
          <g transform="translate(160 90)">
            <ellipse className="pop c7-s2" rx="11" ry="4" cy="12" fill="#0f1726" />
            <g className="pop c7-b2">
              <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
            </g>
          </g>
          <g transform="translate(236 90)">
            <ellipse className="pop c7-s3" rx="11" ry="4" cy="12" fill="#0f1726" />
            <g className="pop c7-b3">
              <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
            </g>
          </g>
          <text className="c7-l1" x="96" y="164" fontSize="13" fontWeight="800" fill="#2346a8" textAnchor="middle">
            인
          </text>
          <text className="c7-l2" x="160" y="164" fontSize="13" fontWeight="800" fill="#2346a8" textAnchor="middle">
            닿으면 인
          </text>
          <text className="c7-l3" x="236" y="164" fontSize="13" fontWeight="800" fill="#c2253d" textAnchor="middle">
            아웃
          </text>
        </g>
        <g className="c7-gb">
          <rect x="0" y="40" width="138" height="100" fill="#5a7bd6" />
          <rect x="138" y="40" width="14" height="100" fill="#ffffff" />
          <rect x="152" y="40" width="146" height="100" fill="#2346a8" />
          <text x="69" y="28" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
            논 발리 존
          </text>
          <text x="145" y="28" fontSize="12" fontWeight="700" fill="#2346a8" textAnchor="middle">
            논 발리 존 라인
          </text>
          <text x="235" y="28" fontSize="12" fontWeight="700" fill="#4f5a70" textAnchor="middle">
            서비스 코트
          </text>
          <g transform="translate(150 90)">
            <ellipse className="pop c7-s4" rx="11" ry="4" cy="12" fill="#0f1726" />
            <g className="pop c7-b4">
              <circle r="11" fill="#ffd54a" stroke="#0f1726" strokeWidth="1.5" />
            </g>
          </g>
          <text className="pop c7-l4" x="150" y="164" fontSize="13" fontWeight="800" fill="#c2253d" textAnchor="middle">
            서브는 닿으면 폴트
          </text>
        </g>
      </svg>
    </div>
  </RuleFigure>
);
