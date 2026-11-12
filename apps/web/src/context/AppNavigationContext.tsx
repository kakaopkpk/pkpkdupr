import React, { createContext, useContext } from "react";
import type { TabKey } from "@/context/TabNavigationContext";

export type RecordMatchSheetRequest =
  /** 새 경기. presetTeams(선수 id)를 주면 선수 고르기 자리를 채운 채 연다 */
  | { kind: "new"; presetTeams?: [string[], string[]] }
  /** 진행 중 경기 점수 입력 또는 완료 경기 수정(같은 화면) */
  | { kind: "score"; matchId: string };

export interface SessionReportRequest {
  sessionId: string;
  requestedAt: number;
}

export interface AppNavigationContextValue {
  selectTab: (tab: TabKey) => void;
  openMatchDetail: (matchId: string) => void;
  /** 내 id면 나 탭으로 전환 */
  openMemberProfile: (playerId: string) => void;
  openRecordMatch: (request: RecordMatchSheetRequest) => void;
  openCreateSession: () => void;
  openSettings: () => void;
  /** 기록 탭으로 바꾸고 그 세션을 고르게 한다 */
  openSessionReport: (sessionId: string) => void;
  /** 마지막 openSessionReport 요청. 기록 탭이 읽어 세션을 고른다 */
  sessionReportRequest: SessionReportRequest | null;
  /** 경기 기록·수정·시작, 세션 생성, 참여 변경 뒤 호출 */
  notifyDataChanged: () => void;
  /** notifyDataChanged마다 1 증가. 탭 페이지는 이 값을 데이터 재조회 의존성으로 쓴다 */
  dataVersion: number;
}

/**
 * 셸(BottomNav)이 한 번씩 렌더하는 전역 화면의 레이어(z-index).
 * 래퍼 내부를 갈아 끼우는 단위도 이 값을 그대로 쓴다.
 * 경기 상세(70)는 그 안의 결과 수정 시트(MatchDetail, 80)보다 아래여야 한다.
 */
export const GLOBAL_LAYER = {
  memberProfile: 62,
  memberMatchHistory: 64,
  matchDetail: 70,
  recordMatch: 90,
  createSession: 90,
  settings: 90,
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
