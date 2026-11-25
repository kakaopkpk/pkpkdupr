import React from "react";
import closingGreetingPhoto from "../photos/1-closing-greeting.jpg";
import ballCallPhoto from "../photos/2-ball-call.jpg";
import passingPhoto from "../photos/3-passing.jpg";
import beforeServePhoto from "../photos/4-before-serve.jpg";
import { RuleFigure } from "../RulesGuideParts";

/**
 * 규칙 안내 11장 그림: 에티켓 사진. 움직임은 rulesGuide.css의 .pk-rules-c11.
 * 말풍선 꼬리·점선 원은 사진(600×448)을 298×220 칸에 cover로 채웠을 때의 사람·공 위치에 맞췄다
 */
export const EtiquetteFigure: React.FC = () => (
  <RuleFigure label={"에티켓 사진과 말풍선: 경기가 끝나면 네트에서 패들을 맞대고 인사해요, 옆 코트 공이 들어오면 \"볼!\"이라고 외치고 그 랠리는 다시 해요, 다른 코트 뒤는 랠리가 끝난 뒤에 지나가요, 상대가 준비됐는지 확인하고 점수를 크게 부르고 서브해요"}>
    <div className="et-img et-i1">
      <img alt="" src={closingGreetingPhoto} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div className="et-bub et-q1a" style={{ left: "23px", top: "25px", transformOrigin: "56px 100%" }}>
        수고하셨어요!
        <i style={{ left: "56px", bottom: "-4px" }} />
      </div>
      <div className="et-bub et-q1b" style={{ left: "174px", top: "27px", transformOrigin: "66px 100%" }}>
        감사합니다!
        <i style={{ left: "66px", bottom: "-4px" }} />
      </div>
    </div>
    <div className="et-img et-i2">
      <img alt="" src={ballCallPhoto} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div className="et-bub et-q2a big" style={{ left: "134px", top: "36px", transformOrigin: "100% 12px" }}>
        볼!
        <i style={{ right: "-4px", top: "12px" }} />
      </div>
      <div className="et-ring et-q2b" style={{ left: "78px", top: "163px" }} />
    </div>
    <div className="et-img et-i3">
      <img alt="" src={passingPhoto} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div className="et-bub et-q3a" style={{ left: "90px", top: "36px", transformOrigin: "0 14px" }}>
        랠리 끝나면 지나갈게요
        <i style={{ left: "-4px", top: "14px" }} />
      </div>
    </div>
    <div className="et-img et-i4">
      <img alt="" src={beforeServePhoto} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div className="et-bub et-q4a" style={{ left: "10px", top: "20px", transformOrigin: "52px 100%" }}>
        준비됐어요!
        <i style={{ left: "52px", bottom: "-4px" }} />
      </div>
      <div className="et-bub et-q4b" style={{ left: "92px", top: "25px", transformOrigin: "100% 12px" }}>
        Four, Two, One!
        <i style={{ right: "-4px", top: "12px" }} />
      </div>
    </div>
    <div className="et-bars">
      <span className="et-bar et-b1">
        <i />
      </span>
      <span className="et-bar et-b2">
        <i />
      </span>
      <span className="et-bar et-b3">
        <i />
      </span>
      <span className="et-bar et-b4">
        <i />
      </span>
    </div>
  </RuleFigure>
);
