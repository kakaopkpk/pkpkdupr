import React from "react";
import { RuleFigure } from "../RulesGuideParts";

/** 규칙 안내 1장 그림: 이기는 조건: 11점 선취, 10:10부터 2점 차. 움직임은 rulesGuide.css의 .pk-rules-c1 */
export const WinConditionFigure: React.FC = () => (
  <RuleFigure label="점수판: 11대 7이면 승리, 11대 10은 아직이고 12대 10이면 승리">
    <div className="lay l1">
      <span className="chip">
        11점을 먼저 내면 승리
      </span>
      <div className="board">
        <div className="box">
          <span className="lbl">
            우리 팀
          </span>
          <span className="num">
            <span className="a9">
              9
            </span>
            <span className="a10">
              10
            </span>
            <span className="a11">
              11
            </span>
          </span>
          <span className="win w1">
            승리
          </span>
        </div>
        <div className="box">
          <span className="lbl">
            상대 팀
          </span>
          <span className="num them">
            <span>
              7
            </span>
          </span>
        </div>
      </div>
    </div>
    <div className="lay l2">
      <span className="chip">
        10:10부터는 2점 차가 나야 승리
      </span>
      <div className="board">
        <div className="box">
          <span className="lbl">
            우리 팀
          </span>
          <span className="num">
            <span className="b10">
              10
            </span>
            <span className="b11">
              11
            </span>
            <span className="b12">
              12
            </span>
          </span>
          <span className="win w2">
            승리
          </span>
        </div>
        <div className="box">
          <span className="lbl">
            상대 팀
          </span>
          <span className="num them">
            <span>
              10
            </span>
          </span>
        </div>
      </div>
      <div style={{ position: "relative", height: "18px", width: "240px" }}>
        <span className="note n2a" style={{ position: "absolute", inset: "0", textAlign: "center" }}>
          11:10은 아직 아니에요
        </span>
        <span className="note n2b" style={{ position: "absolute", inset: "0", textAlign: "center", color: "#2346a8" }}>
          12:10, 2점 차로 승리
        </span>
      </div>
    </div>
  </RuleFigure>
);
