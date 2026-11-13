import React, { createContext, useContext } from "react";
import type { TabKey } from "@/context/TabNavigationContext";

export type RecordMatchSheetRequest =
  /** 새 경기. presetTeams(선수 id)를 주면 선수 고르기 자리를 채운 채 연다 */
  | { kind: "new"; presetTeams?: [string[], string[]] }
  /** 진행 중 경기 점수 입력 또는 완료 경기 수정(같은 화면) */
  | { kind: "score"; matchId: string };

export interface AchievementDetailRequest {
  /** 업적 주인 */
  playerId: string;
  achievementId: string;
}

export interface AppNavigationContextValue {
  selectTab: (tab: TabKey) => void;
  openMatchDetail: (matchId: string) => void;
  /** 내 id면 나 탭으로 전환 */
  openMemberProfile: (playerId: string) => void;
  openRecordMatch: (request: RecordMatchSheetRequest) => void;
  openCreateSession: () => void;
  openSettings: () => void;
  /** 업적 상세 바텀시트. 열린 화면·경기 기록 시트 위에 뜬다 */
  openAchievementDetail: (params: AchievementDetailRequest) => void;
  /** 지금 탭 위에 세션 상세 화면을 쌓는다 */
  openSessionReport: (sessionId: string) => void;
  /** 경기 기록·수정·시작, 세션 생성, 참여 변경 뒤 호출 */
  notifyDataChanged: () => void;
  /** notifyDataChanged마다 1 증가. 탭 페이지는 이 값을 데이터 재조회 의존성으로 쓴다 */
  dataVersion: number;
}

/**
 * 셸(BottomNav)이 렌더하는 전역 레이어(z-index).
 * 화면 이동(PushScreen)은 pushScreen부터 쌓인 순서만큼 1씩 올라가고(최대 +20),
 * 화면 위에서 여는 바텀시트(sheet·recordMatch·createSession)는 그보다 위다.
 * 업적 상세(achievementDetail)는 경기 기록 시트의 기록 완료 화면에서도 열리므로 그보다 위다.
 * pushScreen은 + 메뉴(60)보다 위여야 하단 바·+ 버튼을 모두 덮는다.
 */
export const GLOBAL_LAYER = {
  pushScreen: 62,
  sheet: 90,
  recordMatch: 90,
  createSession: 90,
  achievementDetail: 95,
  /** 업적 달성 축하 연출. 경기 기록 시트·업적 상세보다 위 */
  achievementCelebration: 100,
} as const;

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null,
);

export const AppNavigationProvider: React.FC<{
  value: AppNavigationContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <AppNavigationContext.Provider value={value}>
    {children}
  </AppNavigationContext.Provider>
);

export const useAppNavigation = (): AppNavigationContextValue => {
  const context = useContext(AppNavigationContext);

  if (!context) {
    throw new Error(
      "useAppNavigation must be used within AppNavigationProvider",
    );
  }

  return context;
};
