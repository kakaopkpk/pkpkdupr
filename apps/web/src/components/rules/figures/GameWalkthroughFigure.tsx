import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 6장 그림: 경기 시뮬레이션. 움직임은 rulesGuide.css의 .pk-rules-c6 */
export const GameWalkthroughFigure: React.FC = () => (
  <RuleFigure>
    <div className="scene" style={{ position: "absolute", inset: "0" }}>
      <svg width="298" height="210" viewBox="0 0 298 210" role="img" aria-label="한 판 따라가기: 공격팀 옆 노란 공은 남은 서브권. 서브권 1개로 Zero Zero Two로 시작해 득점하면 자리를 바꾸고, 지면 상대 팀 서브, 상대 1번·2번이 지면 다시 우리 서브" style={{ position: "absolute", left: "0", top: "0" }}>
        <rect x="17" y="54" width="264" height="120" fill="#2346a8" />
        <rect x="107" y="54" width="84" height="120" fill="#5a7bd6" />
        <rect x="17" y="54" width="264" height="120" fill="none" stroke="#ffffff" strokeWidth="2" />
        <path d="M107 54 V174 M191 54 V174 M17 114 H107 M191 114 H281" stroke="#ffffff" strokeWidth="2" fill="none" />
        <line x1="149" y1="48" x2="149" y2="178" stroke="#0f1726" strokeWidth="3" strokeLinecap="round" />
        <text className="s10-ra" x="17" y="198" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="start">
          공격팀
        </text>
        <text className="s10-rd" x="17" y="198" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="start">
          수비팀
        </text>
        <text className="s10-rd" x="281" y="198" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="end">
          공격팀
        </text>
        <text className="s10-ra" x="281" y="198" fontSize="12" fontWeight="800" fill="#4f5a70" textAnchor="end">
          수비팀
        </text>
        <g className="s10-gA">
          <circle cx="62" cy="194" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
          <circle className="pop s10-pA" cx="62" cy="194" r="5" fill="#ffd54a" />
        </g>
        <g className="s10-gR">
          <circle cx="236" cy="194" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
          <circle className="pop s10-pR1" cx="236" cy="194" r="5" fill="#ffd54a" />
          <circle cx="223" cy="194" r="5" fill="none" stroke="#e0a800" strokeWidth="1.5" />
          <circle className="pop s10-pR2" cx="223" cy="194" r="5" fill="#ffd54a" />
        </g>
        <g className="s10-gC">
          <circle cx="62" cy="194" r="5" fill="#ffd54a" />
          <circle cx="75" cy="194" r="5" fill="#ffd54a" />
        </g>
        <g transform="translate(0 4)">
          <g transform="translate(272 80)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text className="s10-nt" y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              1
            </text>
          </g>
          <g transform="translate(272 140)">
            <circle r="11" fill="#152a5e" stroke="#ffffff" strokeWidth="1.5" />
            <text className="s10-nt" y="4" fontSize="12" fontWeight="800" fill="#ffffff" textAnchor="middle">
              2
            </text>
          </g>
          <g className="s10-ring">
            <circle r="16" fill="none" stroke="#ffd54a" strokeWidth="3" />
          </g>
          <g className="s10-pa">
            <circle r="11" fill="#ffffff" />
            <text className="s10-na" y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              2
            </text>
          </g>
          <g className="s10-pb">
            <circle r="11" fill="#ffffff" />
            <text className="s10-nb" y="4" fontSize="12" fontWeight="800" fill="#2346a8" textAnchor="middle">
              1
            </text>
          </g>
          <g transform="translate(236 84)">
            <circle className="pop s10-rp1" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 118)">
            <circle className="pop s10-rp2" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(226 140)">
            <circle className="pop s10-rp3" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(9 100)">
            <circle className="pop s10-rp4" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 136)">
            <circle className="pop s10-rp5" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(80 100)">
            <circle className="pop s10-rp6" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(289 120)">
            <circle className="pop s10-rp7" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(62 138)">
            <circle className="pop s10-rp8" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(226 100)">
            <circle className="pop s10-rp9" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(9 120)">
            <circle className="pop s10-rp10" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(62 82)">
            <circle className="pop s10-rp11" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(230 130)">
            <circle className="pop s10-rp12" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(9 96)">
            <circle className="pop s10-rp13" r="8" fill="none" stroke="#c2253d" strokeWidth="2.5" />
          </g>
          <g transform="translate(236 84)">
            <circle className="pop s10-rp14" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(84 118)">
            <circle className="pop s10-rp15" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g transform="translate(230 96)">
            <circle className="pop s10-rp16" r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
          </g>
          <circle className="s10-ball" r="5" fill="#ffd54a" stroke="#0f1726" strokeWidth="1" />
        </g>
        <g transform="translate(116 200)">
          <text className="s10-o0" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">
            0
          </text>
          <text className="pop s10-o1" fontSize="22" fontWeight="800" fill="#2346a8" textAnchor="middle">
            1
          </text>
        </g>
        <text x="149" y="197" fontSize="18" fontWeight="800" fill="#4f5a70" textAnchor="middle">
          :
        </text>
        <g transform="translate(182 200)">
          <text fontSize="22" fontWeight="800" fill="#4f5a70" textAnchor="middle">
            0
          </text>
        </g>
      </svg>
      <div className="call s10-k1">
        <span>
          <b>
            "Zero, Zero, Two!"
          </b>
          <i>
            처음 공격하는 팀은 서브권이 1개
          </i>
        </span>
      </div>
      <div className="call s10-k2">
        <span>
          <b>
            "One, Zero, Two!"
          </b>
          <i>
            득점하면 자리 바꿔 같은 사람이
          </i>
        </span>
      </div>
      <div className="call s10-k3">
        <span>
          <b>
            "Zero, One, One!"
          </b>
          <i>
            서브권이 1개라 지면 바로 상대 팀으로
          </i>
        </span>
      </div>
      <div className="call s10-k4">
        <span>
          <b>
            "Zero, One, Two!"
          </b>
          <i>
            서브권 1개 남아 2번이 서브
          </i>
        </span>
      </div>
      <div className="call s10-k5">
        <span>
          <b>
            "One, Zero, One!"
          </b>
          <i>
            서브권 다 쓰면 우리 서브, 오른쪽이 1번
          </i>
        </span>
      </div>
    </div>
  </RuleFigure>
);
