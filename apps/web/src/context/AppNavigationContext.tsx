import React, { createContext, useContext } from "react";
import type { MatchTopLevelType } from "@pkpkdupr/shared/match";
import type { TabKey } from "@/context/TabNavigationContext";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";

export type RecordMatchSheetRequest =
  /** 새 경기. presetTeams(선수 id)를 주면 선수 고르기 자리를 채운 채 연다 */
  | { kind: "new"; presetTeams?: [string[], string[]] }
  /** 진행 중 경기 점수 입력 또는 완료 경기 수정(같은 화면) */
  | { kind: "score"; matchId: string };

export interface CreateSessionRequest {
  /** 처음 골라 둘 날짜(KST 날짜 키) */
  dateKey?: string;
  /** 만든 뒤(세션 무효화 다음에) 부른다 */
  onCreated?: (session: MatchSessionDetailInfo) => void;
}

export interface AchievementDetailRequest {
  /** 업적 주인 */
  playerId: string;
  achievementId: string;
  /** 여는 곳이 아는 받은 여부. 시트가 배지를 불러오기 전에 바로 그린다 */
  earned: boolean;
}

export interface AchievementsScreenRequest {
  /** 업적 주인 */
  playerId: string;
  /** 주면 그 업적 줄로 스크롤해 잠깐 강조한다 */
  focusAchievementId?: string;
}

export interface MemberProfileOpenOptions {
  /** 평점 카드·통계가 처음 보일 종목. 없으면 복식 */
  initialCategory?: MatchTopLevelType;
}

export interface AppNavigationContextValue {
  selectTab: (tab: TabKey) => void;
  openMatchDetail: (matchId: string) => void;
  /** 내 id면 나 탭으로 전환 */
  openMemberProfile: (
    playerId: string,
    options?: MemberProfileOpenOptions,
  ) => void;
  openRecordMatch: (request: RecordMatchSheetRequest) => void;
  /** 세션 만들기 시트 */
  openCreateSession: (request?: CreateSessionRequest) => void;
  openSettings: () => void;
  /** 업적 상세 바텀시트. 열린 화면·경기 기록 시트 위에 뜬다 */
  openAchievementDetail: (params: AchievementDetailRequest) => void;
  /** 업적 전체 보기 전역 화면. 내 id여도 나 탭으로 바꾸지 않는다 */
  openAchievements: (request: AchievementsScreenRequest) => void;
  /**
   * 지금 탭 위에 세션 상세 화면을 쌓는다. 다가오는·진행 중·끝난 세션 모두 열리며,
   * 끝난 세션만 세션 리포트를 함께 보인다(완료 경기가 없으면 리포트 없이)
   */
  openSessionReport: (sessionId: string) => void;
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
  /** 프로필 사진 확대 보기. 프로필 화면(PushScreen) 위 */
  avatarZoom: 90,
  /** 업적 달성 축하 연출. 경기 기록 시트·업적 상세보다 위 */
  achievementCelebration: 100,
  /** 세션 칭찬 팝업. 업적 축하와 같은 높이이고 둘이 함께 뜨지 않는다 */
  sessionPraise: 100,
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
