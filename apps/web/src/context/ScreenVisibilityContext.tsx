import React, { createContext, useContext } from "react";

// 제공자 밖(바텀시트 등)은 언제나 보이는 것으로 본다
const ScreenVisibilityContext = createContext(true);

/**
 * 안쪽 화면이 지금 사용자에게 보이는지 알린다.
 * keep-alive 탭 패널(선택됨 && 탭 셸이 PushScreen에 덮이지 않음)과 PushScreen 본문(열림 && 활성 && 덮이지 않음)에서 제공한다.
 * 바깥 제공자의 값과 합치지 않고 가장 가까운 제공자의 값만 따른다.
 */
export const ScreenVisibilityProvider: React.FC<{
  isVisible: boolean;
  children: React.ReactNode;
}> = ({ isVisible, children }) => (
  <ScreenVisibilityContext.Provider value={isVisible}>
    {children}
  </ScreenVisibilityContext.Provider>
);

export const useIsScreenVisible = (): boolean =>
  useContext(ScreenVisibilityContext);
