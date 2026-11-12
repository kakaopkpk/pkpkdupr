import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Alert, CloseButton } from "@heroui/react";
import {
  JoinSessionBar,
  MyMatchBar,
  NavPill,
  PlusMenu,
  getTabId,
  getTabPanelId,
  TAB_ITEMS,
} from "@/components/BottomDock";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import PullToRefreshIndicator, {
  type PullToRefreshStatus,
} from "@/components/PullToRefreshIndicator";
import MatchDetailDrawer from "@/components/match/MatchDetailDrawer";
import MemberProfileDrawer from "@/components/profile/MemberProfileDrawer";
import RecordMatchSheet from "@/components/record/RecordMatchSheet";
import CreateSessionSheet from "@/components/session/CreateSessionSheet";
import SettingsDrawer from "@/components/settings/SettingsDrawer";
import {
  AppNavigationProvider,
  type AppNavigationContextValue,
  type RecordMatchSheetRequest,
  type SessionReportRequest,
} from "@/context/AppNavigationContext";
import { useAuth } from "@/context/AuthContext";
import {
  LiveSessionProvider,
  useLiveSessionState,
} from "@/context/LiveSessionContext";
import {
  TabNavigationProvider,
  type TabDepthEntry,
  type TabDepthKind,
  type TabDepthStacks,
  type TabKey,
  type PullToRefreshHandler,
} from "@/context/TabNavigationContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  PULL_TO_REFRESH_BASE_RESISTANCE,
  PULL_TO_REFRESH_MIN_RESISTANCE,
  PULL_TO_REFRESH_THRESHOLD,
} from "@/hooks/usePullToRefresh";
import { triggerHapticFeedback } from "@/lib/haptics";
import { addMatchSessionParticipant } from "@/lib/matchSessions";
import { DEFAULT_THEME_COLOR, DIMMED_THEME_COLOR } from "@/lib/themeColor";
import Home from "@/pages/Home";
import Me from "@/pages/Me";
import Ranking from "@/pages/Ranking";
import Records from "@/pages/Records";

const TAB_KEYS: TabKey[] = TAB_ITEMS.map((item) => item.key);
const TAB_PAGES: Record<TabKey, React.FC> = {
  home: Home,
  records: Records,
  ranking: Ranking,
  me: Me,
};

const emptyDepthStacks = (): TabDepthStacks => ({
  home: [],
  records: [],
  ranking: [],
  me: [],
});

const emptyDepthEntries = (): Record<TabKey, TabDepthEntry[]> => ({
  home: [],
  records: [],
  ranking: [],
  me: [],
});

const initiallyVisitedTabs = (): Record<TabKey, boolean> => ({
  home: true,
  records: false,
  ranking: false,
  me: false,
});

/** 탭 루트의 당겨서 새로고침과 터치를 막는 깊이 */
const BLOCKING_DEPTH_KINDS: TabDepthKind[] = ["bottom-sheet", "dropdown"];
const GLOBAL_MENU_DEPTH_ID = "global-menu";

/** 하단 바 높이·미니바 높이·둘 사이 간격·화면 아래(safe-area 위) 여백(px) */
const NAV_BAR_HEIGHT_PX = 66;
const DOCK_BAR_HEIGHT_PX = 60;
const DOCK_BAR_GAP_PX = 10;
const NAV_BOTTOM_GAP_PX = 8;

const HISTORY_DEPTH_STATE_KEY = "__pkpkduprTabDepth";
const PULL_TO_REFRESH_SLOW_REQUEST_MS = 8_000;
const PULL_GESTURE_DIRECTION_THRESHOLD = 8;
const DEEP_LINK_MATCH_ID_PARAM = "matchId";

const getDeepLinkMatchId = () => {
  if (typeof window === "undefined") return null;

  const matchId = new URLSearchParams(window.location.search)
    .get(DEEP_LINK_MATCH_ID_PARAM)
    ?.trim();
  return matchId || null;
};

const getUrlWithoutDeepLinkMatchId = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete(DEEP_LINK_MATCH_ID_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

interface TabDepthHistoryState {
  [HISTORY_DEPTH_STATE_KEY]: true;
  tabKey: TabKey;
  depthId: string;
  sequence: number;
}

const isTabDepthHistoryState = (
  state: unknown,
): state is TabDepthHistoryState => {
  if (!state || typeof state !== "object") return false;

  const maybeState = state as Partial<TabDepthHistoryState>;
  return (
    maybeState[HISTORY_DEPTH_STATE_KEY] === true &&
    typeof maybeState.depthId === "string" &&
    TAB_KEYS.includes(maybeState.tabKey as TabKey)
  );
};

/** 전역 화면 하나의 열림 상태. tabKey는 연 탭이며 닫힌 뒤에도 닫히는 애니메이션을 위해 유지한다 */
interface GlobalLayerState<T> {
  value: T | null;
  tabKey: TabKey;
}

const closedLayer = <T,>(): GlobalLayerState<T> => ({
  value: null,
  tabKey: "home",
});

const BottomNav: React.FC = () => {
  const { player } = useAuth();
  const isOnline = useOnlineStatus();
  const liveSessionState = useLiveSessionState(player?.id);
  const [selectedTab, setSelectedTab] = useState<TabKey>("home");
  const [visitedTabs, setVisitedTabs] =
    useState<Record<TabKey, boolean>>(initiallyVisitedTabs);
  const [depthStacks, setDepthStacks] =
    useState<TabDepthStacks>(emptyDepthStacks);
  const [isGlobalMenuOpen, setIsGlobalMenuOpen] = useState(false);
  const [globalMenuTabKey, setGlobalMenuTabKey] = useState<TabKey>("home");
  const [dataVersion, setDataVersion] = useState(0);
  const [sessionReportRequest, setSessionReportRequest] =
    useState<SessionReportRequest | null>(null);
  const [matchDetailLayer, setMatchDetailLayer] =
    useState<GlobalLayerState<string>>(closedLayer);
  const [memberProfileLayer, setMemberProfileLayer] =
    useState<GlobalLayerState<string>>(closedLayer);
  const [recordMatchLayer, setRecordMatchLayer] =
    useState<GlobalLayerState<RecordMatchSheetRequest>>(closedLayer);
  const [createSessionLayer, setCreateSessionLayer] =
    useState<GlobalLayerState<true>>(closedLayer);
  const [settingsLayer, setSettingsLayer] =
    useState<GlobalLayerState<true>>(closedLayer);
  const [isJoiningLiveSession, setIsJoiningLiveSession] = useState(false);
  const [joinLiveSessionError, setJoinLiveSessionError] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullToRefreshStatus, setPullToRefreshStatus] =
    useState<PullToRefreshStatus>("idle");
  const [isPullRefreshSlow, setIsPullRefreshSlow] = useState(false);
  const [isInstallPromptVisible, setIsInstallPromptVisible] = useState(false);
  const handledDeepLinkRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const depthScrollContainersRef = useRef(
    new Map<string, HTMLDivElement>(),
  );
  const selectedTabRef = useRef<TabKey>(selectedTab);
  const depthEntriesRef = useRef<Record<TabKey, TabDepthEntry[]>>(
    emptyDepthEntries(),
  );
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const historySequenceRef = useRef(0);
  const currentHistoryDepthRef = useRef<TabDepthHistoryState | null>(null);
  const afterCloseCallbacksRef = useRef(new Map<string, () => void>());
  const closingDepthKeysRef = useRef(new Set<string>());
  const pullToRefreshHandlersRef = useRef<
    Partial<Record<TabKey, PullToRefreshHandler>>
  >({});
  const pullStartRef = useRef<{
    identifier: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const pullDistanceRef = useRef(0);
  const isPullToRefreshArmedRef = useRef(false);
  const isPullGestureActiveRef = useRef(false);
  const pullGestureAxisRef = useRef<"undecided" | "vertical" | "horizontal">(
    "undecided",
  );
  const isPullRefreshingRef = useRef(false);
  const pullRefreshRequestIdRef = useRef(0);
  const pullStatusTimeoutRef = useRef<number | null>(null);
  const pullSlowRequestTimeoutRef = useRef<number | null>(null);

  const depthCallbackKey = (tabKey: TabKey, depthId: string) =>
    `${tabKey}:${depthId}`;

  const syncDepthStacks = useCallback(() => {
    setDepthStacks({
      home: depthEntriesRef.current.home.map((entry) => entry.id),
      records: depthEntriesRef.current.records.map((entry) => entry.id),
      ranking: depthEntriesRef.current.ranking.map((entry) => entry.id),
      me: depthEntriesRef.current.me.map((entry) => entry.id),
    });
  }, []);

  const getScrollPositionKey = useCallback((tabKey: TabKey) => {
    const tabDepthStack = depthEntriesRef.current[tabKey];
    const activeDepth = tabDepthStack[tabDepthStack.length - 1];

    return `${tabKey}:${activeDepth?.id ?? "root"}`;
  }, []);

  const getActiveScrollContainer = useCallback(
    (tabKey = selectedTabRef.current) => {
      const tabDepthStack = depthEntriesRef.current[tabKey];
      const activeDepth = tabDepthStack[tabDepthStack.length - 1];

      if (activeDepth) {
        const depthScrollContainer = depthScrollContainersRef.current.get(
          `${tabKey}:${activeDepth.id}`,
        );
        if (depthScrollContainer) return depthScrollContainer;
      }

      return scrollContainerRef.current;
    },
    [],
  );

  const getScrollTop = useCallback(
    () => getActiveScrollContainer()?.scrollTop ?? 0,
    [getActiveScrollContainer],
  );

  const registerScrollContainer = useCallback(
    (tabKey: TabKey, depthId: string, element: HTMLDivElement | null) => {
      const key = `${tabKey}:${depthId}`;

      if (element) {
        depthScrollContainersRef.current.set(key, element);
        return;
      }

      depthScrollContainersRef.current.delete(key);
    },
    [],
  );

  const saveScrollPosition = useCallback(
    (tabKey = selectedTabRef.current) => {
      scrollPositionsRef.current[getScrollPositionKey(tabKey)] = getScrollTop();
    },
    [getScrollPositionKey, getScrollTop],
  );

  const restoreScrollTop = useCallback(
    (tabKey = selectedTabRef.current) => {
      const scrollPositionKey = getScrollPositionKey(tabKey);

      window.requestAnimationFrame(() => {
        if (selectedTabRef.current !== tabKey) return;

        const scrollContainer = getActiveScrollContainer(tabKey);
        if (!scrollContainer) return;

        scrollContainer.scrollTop =
          scrollPositionsRef.current[scrollPositionKey] ?? 0;
      });
    },
    [getActiveScrollContainer, getScrollPositionKey],
  );

  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      getActiveScrollContainer()?.scrollTo({ top: 0, behavior });
    },
    [getActiveScrollContainer],
  );

  const registerPullToRefresh = useCallback(
    (tabKey: TabKey, handler: PullToRefreshHandler) => {
      pullToRefreshHandlersRef.current[tabKey] = handler;

      return () => {
        if (pullToRefreshHandlersRef.current[tabKey] === handler) {
          delete pullToRefreshHandlersRef.current[tabKey];
        }
      };
    },
    [],
  );

  const removeDepthEntry = useCallback(
    (tabKey: TabKey, depthId: string) => {
      const stack = depthEntriesRef.current[tabKey];
      const targetEntry = stack.find((entry) => entry.id === depthId);

      if (!targetEntry) return false;

      depthEntriesRef.current = {
        ...depthEntriesRef.current,
        [tabKey]: stack.filter((entry) => entry.id !== depthId),
      };
      syncDepthStacks();
      targetEntry.onClose();

      const callbackKey = depthCallbackKey(tabKey, depthId);
      closingDepthKeysRef.current.delete(callbackKey);
      const afterClose = afterCloseCallbacksRef.current.get(callbackKey);
      if (afterClose) {
        afterCloseCallbacksRef.current.delete(callbackKey);
        afterClose();
      }

      return true;
    },
    [syncDepthStacks],
  );

  const isCurrentHistoryDepth = useCallback(
    (tabKey: TabKey, depthId: string) => {
      const historyState = window.history.state;

      return (
        isTabDepthHistoryState(historyState) &&
        historyState.tabKey === tabKey &&
        historyState.depthId === depthId
      );
    },
    [],
  );

  const pushDepth = useCallback(
    (tabKey: TabKey, entry: TabDepthEntry) => {
      const stack = depthEntriesRef.current[tabKey];
      const existingEntry = stack.find(
        (stackEntry) => stackEntry.id === entry.id,
      );

      if (!existingEntry) {
        depthEntriesRef.current = {
          ...depthEntriesRef.current,
          [tabKey]: [...stack, entry],
        };
        syncDepthStacks();
        historySequenceRef.current += 1;
        const historyState = {
          [HISTORY_DEPTH_STATE_KEY]: true,
          tabKey,
          depthId: entry.id,
          sequence: historySequenceRef.current,
        } satisfies TabDepthHistoryState;
        window.history.pushState(historyState, "", window.location.href);
        currentHistoryDepthRef.current = historyState;
      }

      return () => {
        const currentStack = depthEntriesRef.current[tabKey];
        if (!currentStack.some((stackEntry) => stackEntry.id === entry.id)) {
          return;
        }

        depthEntriesRef.current = {
          ...depthEntriesRef.current,
          [tabKey]: currentStack.filter(
            (stackEntry) => stackEntry.id !== entry.id,
          ),
        };
        syncDepthStacks();
      };
    },
    [syncDepthStacks],
  );

  const closeDepth = useCallback(
    (tabKey: TabKey, depthId: string, afterClose?: () => void) => {
      const stack = depthEntriesRef.current[tabKey];
      if (!stack.some((entry) => entry.id === depthId)) return false;

      if (afterClose) {
        afterCloseCallbacksRef.current.set(
          depthCallbackKey(tabKey, depthId),
          afterClose,
        );
      }

      const callbackKey = depthCallbackKey(tabKey, depthId);
      if (isCurrentHistoryDepth(tabKey, depthId)) {
        if (!closingDepthKeysRef.current.has(callbackKey)) {
          closingDepthKeysRef.current.add(callbackKey);
          window.history.back();
        }
        return true;
      }

      return removeDepthEntry(tabKey, depthId);
    },
    [isCurrentHistoryDepth, removeDepthEntry],
  );

  const requestCloseTopDepth = useCallback(
    (tabKey = selectedTabRef.current) => {
      const stack = depthEntriesRef.current[tabKey];
      const topEntry = stack[stack.length - 1];
      if (!topEntry) return false;

      return closeDepth(tabKey, topEntry.id);
    },
    [closeDepth],
  );

  const selectTab = useCallback(
    (nextTab: TabKey) => {
      const currentTab = selectedTabRef.current;
      if (nextTab === currentTab) return;

      saveScrollPosition(currentTab);
      setVisitedTabs((currentVisitedTabs) =>
        currentVisitedTabs[nextTab]
          ? currentVisitedTabs
          : { ...currentVisitedTabs, [nextTab]: true },
      );
      selectedTabRef.current = nextTab;
      setSelectedTab(nextTab);
      restoreScrollTop(nextTab);
    },
    [restoreScrollTop, saveScrollPosition],
  );

  useEffect(() => {
    selectedTabRef.current = selectedTab;
  }, [selectedTab]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const historyDepth = currentHistoryDepthRef.current;
      // Set the destination before running an entry's close callback. A close
      // callback can immediately open another layer (for example, replacing
      // the global menu with a bottom sheet), which pushes a new history state.
      // Updating this ref afterwards would overwrite that new state with the
      // old destination and make the next OS back close the covered depth.
      currentHistoryDepthRef.current = isTabDepthHistoryState(event.state)
        ? event.state
        : null;

      if (historyDepth) {
        removeDepthEntry(historyDepth.tabKey, historyDepth.depthId);
      } else {
        const activeTab = selectedTabRef.current;
        const activeStack = depthEntriesRef.current[activeTab];
        const topEntry = activeStack[activeStack.length - 1];

        if (topEntry) {
          removeDepthEntry(activeTab, topEntry.id);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [removeDepthEntry]);
  const handleTabPress = useCallback(
    (tabKey: TabKey) => {
      if (selectedTabRef.current !== tabKey) {
        selectTab(tabKey);
        return;
      }

      // 활성 탭을 다시 누르면 맨 위로, 이미 맨 위면 가장 위 깊이를 닫는다
      if (getScrollTop() > 0) {
        scrollToTop("smooth");
        return;
      }

      requestCloseTopDepth(tabKey);
    },
    [getScrollTop, requestCloseTopDepth, scrollToTop, selectTab],
  );

  const openGlobalMenu = useCallback(() => {
    const tabKey = selectedTabRef.current;
    setGlobalMenuTabKey(tabKey);
    pushDepth(tabKey, {
      id: GLOBAL_MENU_DEPTH_ID,
      kind: "dropdown",
      onClose: () => setIsGlobalMenuOpen(false),
    });
    setIsGlobalMenuOpen(true);
  }, [pushDepth]);

  /** 메뉴를 닫고, 히스토리 정리가 끝난 뒤 afterClose를 실행한다 */
  const closeGlobalMenu = useCallback(
    (afterClose?: () => void) => {
      if (!closeDepth(globalMenuTabKey, GLOBAL_MENU_DEPTH_ID, afterClose)) {
        setIsGlobalMenuOpen(false);
        afterClose?.();
      }
    },
    [closeDepth, globalMenuTabKey],
  );

  const openMatchDetail = useCallback((matchId: string) => {
    setMatchDetailLayer((current) => ({
      value: matchId,
      tabKey: current.value ? current.tabKey : selectedTabRef.current,
    }));
  }, []);

  const openMemberProfile = useCallback(
    (playerId: string) => {
      if (playerId === player?.id) {
        selectTab("me");
        return;
      }

      setMemberProfileLayer((current) => ({
        value: playerId,
        tabKey: current.value ? current.tabKey : selectedTabRef.current,
      }));
    },
    [player?.id, selectTab],
  );

  const openRecordMatch = useCallback((request: RecordMatchSheetRequest) => {
    setRecordMatchLayer((current) => ({
      value: request,
      tabKey: current.value ? current.tabKey : selectedTabRef.current,
    }));
  }, []);

  const openCreateSession = useCallback(() => {
    setCreateSessionLayer((current) =>
      current.value ? current : { value: true, tabKey: selectedTabRef.current },
    );
  }, []);

  const openSettings = useCallback(() => {
    setSettingsLayer((current) =>
      current.value ? current : { value: true, tabKey: selectedTabRef.current },
    );
  }, []);

  const openSessionReport = useCallback(
    (sessionId: string) => {
      setSessionReportRequest({ sessionId, requestedAt: Date.now() });
      selectTab("records");
    },
    [selectTab],
  );

  const reloadLiveSession = liveSessionState.reload;
  const notifyDataChanged = useCallback(() => {
    setDataVersion((version) => version + 1);
    void reloadLiveSession();
  }, [reloadLiveSession]);

  const closeMatchDetail = useCallback(
    () => setMatchDetailLayer((current) => ({ ...current, value: null })),
    [],
  );
  const closeMemberProfile = useCallback(
    () => setMemberProfileLayer((current) => ({ ...current, value: null })),
    [],
  );
  const closeRecordMatch = useCallback(
    () => setRecordMatchLayer((current) => ({ ...current, value: null })),
    [],
  );
  const closeCreateSession = useCallback(
    () => setCreateSessionLayer((current) => ({ ...current, value: null })),
    [],
  );
  const closeSettings = useCallback(
    () => setSettingsLayer((current) => ({ ...current, value: null })),
    [],
  );

  const handleSessionCreated = useCallback(() => {
    notifyDataChanged();
    selectTab("home");
  }, [notifyDataChanged, selectTab]);

  // ?matchId= 딥링크는 아래에 matchId 없는 히스토리를 남기고 경기 상세를 연다.
  // 그래서 뒤로가기로 닫으면 주소에서 matchId가 빠지고 드로어가 다시 열리지 않는다
  useEffect(() => {
    if (handledDeepLinkRef.current) return;
    handledDeepLinkRef.current = true;

    const matchId = getDeepLinkMatchId();
    if (!matchId) return;

    window.history.replaceState(
      window.history.state,
      "",
      getUrlWithoutDeepLinkMatchId(),
    );
    openMatchDetail(matchId);
  }, [openMatchDetail]);

  const joinLiveSession = useCallback(async () => {
    const sessionId = liveSessionState.liveSession?.id;
    if (!sessionId || !player?.id || isJoiningLiveSession) return;

    setIsJoiningLiveSession(true);
    setJoinLiveSessionError(false);
    try {
      await addMatchSessionParticipant(sessionId, player.id);
      setDataVersion((version) => version + 1);
      // 참여자 목록이 바뀐 세션을 받아야 알림 바가 사라진다
      await reloadLiveSession();
    } catch {
      setJoinLiveSessionError(true);
    } finally {
      setIsJoiningLiveSession(false);
    }
  }, [
    isJoiningLiveSession,
    liveSessionState.liveSession?.id,
    player?.id,
    reloadLiveSession,
  ]);

  const isGlobalMenuVisible =
    isGlobalMenuOpen && globalMenuTabKey === selectedTab;
  const hasBlockingLayer = useMemo(
    () =>
      isGlobalMenuVisible ||
      depthEntriesRef.current[selectedTab].some((entry) =>
        BLOCKING_DEPTH_KINDS.includes(entry.kind),
      ),
    // depthStacks는 depthEntriesRef가 바뀔 때마다 함께 바뀐다
    [depthStacks, isGlobalMenuVisible, selectedTab],
  );

  // 전역 화면은 연 탭과 상관없이 셸 전체를 덮으므로 모든 탭의 깊이가 비어야 홈 탭이 드러난다
  const isHomeTabUncovered =
    selectedTab === "home" &&
    TAB_KEYS.every((tabKey) => depthStacks[tabKey].length === 0);

  const myInProgressMatch = liveSessionState.myInProgressMatch;
  const liveSession = liveSessionState.liveSession;
  const isMyMatchBarVisible =
    selectedTab !== "home" && !!myInProgressMatch && !!player?.id;
  const isJoinSessionBarVisible =
    selectedTab === "home" && !!liveSession && !liveSessionState.isParticipant;
  const isDockBarVisible = isMyMatchBarVisible || isJoinSessionBarVisible;

  useEffect(() => {
    if (!isJoinSessionBarVisible) setJoinLiveSessionError(false);
  }, [isJoinSessionBarVisible]);

  // 페이지·시트가 하단 바에 가리지 않게 화면 아래에서 바(미니바·알림 바 포함) 윗변까지 거리를 알린다
  useEffect(() => {
    const dockHeightPx =
      NAV_BAR_HEIGHT_PX +
      NAV_BOTTOM_GAP_PX +
      (isDockBarVisible ? DOCK_BAR_HEIGHT_PX + DOCK_BAR_GAP_PX : 0);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(
      "--app-bottom-dock-height",
      `calc(${dockHeightPx}px + var(--safe-bottom))`,
    );

    return () => {
      rootStyle.removeProperty("--app-bottom-dock-height");
    };
  }, [isDockBarVisible]);

  useEffect(() => {
    if (!isGlobalMenuVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGlobalMenu();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGlobalMenu, isGlobalMenuVisible]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );

    if (!themeColorMeta || !isGlobalMenuVisible) {
      return;
    }

    themeColorMeta.setAttribute("content", DIMMED_THEME_COLOR);

    return () => {
      themeColorMeta.setAttribute("content", DEFAULT_THEME_COLOR);
    };
  }, [isGlobalMenuVisible]);

  const resetPullToRefresh = useCallback(
    (status: PullToRefreshStatus = "idle") => {
      pullStartRef.current = null;
      pullDistanceRef.current = 0;
      isPullToRefreshArmedRef.current = false;
      isPullGestureActiveRef.current = false;
      pullGestureAxisRef.current = "undecided";
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.overflow = "";
      }
      setPullDistance(0);
      setPullToRefreshStatus(status);
    },
    [],
  );

  const schedulePullToRefreshReset = useCallback(
    (status: PullToRefreshStatus, delay: number) => {
      if (pullStatusTimeoutRef.current != null) {
        window.clearTimeout(pullStatusTimeoutRef.current);
      }
      pullStatusTimeoutRef.current = window.setTimeout(() => {
        pullStatusTimeoutRef.current = null;
        isPullRefreshingRef.current = false;
        resetPullToRefresh();
      }, delay);
      setPullToRefreshStatus(status);
    },
    [resetPullToRefresh],
  );

  const clearPullRefreshSlowWarning = useCallback(() => {
    if (pullSlowRequestTimeoutRef.current != null) {
      window.clearTimeout(pullSlowRequestTimeoutRef.current);
      pullSlowRequestTimeoutRef.current = null;
    }
    setIsPullRefreshSlow(false);
  }, []);

  const cancelPullToRefresh = useCallback(() => {
    pullRefreshRequestIdRef.current += 1;
    if (pullStatusTimeoutRef.current != null) {
      window.clearTimeout(pullStatusTimeoutRef.current);
      pullStatusTimeoutRef.current = null;
    }
    clearPullRefreshSlowWarning();
    isPullRefreshingRef.current = false;
    resetPullToRefresh();
  }, [clearPullRefreshSlowWarning, resetPullToRefresh]);

  useEffect(() => {
    cancelPullToRefresh();
  }, [cancelPullToRefresh, selectedTab]);

  useEffect(
    () => () => {
      if (pullStatusTimeoutRef.current != null) {
        window.clearTimeout(pullStatusTimeoutRef.current);
      }
      if (pullSlowRequestTimeoutRef.current != null) {
        window.clearTimeout(pullSlowRequestTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        isPullRefreshingRef.current ||
        hasBlockingLayer ||
        !pullToRefreshHandlersRef.current[selectedTab]
      ) {
        return;
      }

      const touch = event.touches[0];
      pullStartRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };
      pullDistanceRef.current = 0;
      isPullToRefreshArmedRef.current = false;
      isPullGestureActiveRef.current = false;
      pullGestureAxisRef.current = "undecided";
    };

    const preventScrollWhilePullIndicatorVisible = (event: TouchEvent) => {
      if (pullStartRef.current && isPullGestureActiveRef.current) {
        if (event.cancelable) {
          event.preventDefault();
        }
      }
    };

    scrollContainer.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    scrollContainer.addEventListener(
      "touchmove",
      preventScrollWhilePullIndicatorVisible,
      { passive: false },
    );

    return () => {
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener(
        "touchmove",
        preventScrollWhilePullIndicatorVisible,
      );
    };
  }, [hasBlockingLayer, selectedTab]);

  const updatePullDistance = useCallback(
    (touch: React.Touch) => {
      const start = pullStartRef.current;
      if (!start || hasBlockingLayer || isPullRefreshingRef.current) {
        return false;
      }

      if (pullGestureAxisRef.current !== "vertical") {
        const totalDeltaX = touch.clientX - start.startX;
        const totalDeltaY = touch.clientY - start.startY;
        if (
          Math.max(Math.abs(totalDeltaX), Math.abs(totalDeltaY)) <
          PULL_GESTURE_DIRECTION_THRESHOLD
        ) {
          return true;
        }

        if (Math.abs(totalDeltaX) > Math.abs(totalDeltaY)) {
          pullGestureAxisRef.current = "horizontal";
          resetPullToRefresh();
          return false;
        }

        pullGestureAxisRef.current = "vertical";
      }

      const deltaY = touch.clientY - start.lastY;
      pullStartRef.current = {
        ...start,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };

      let pullDeltaY = deltaY;
      if (!isPullGestureActiveRef.current) {
        if (deltaY <= 0) return true;

        const scrollContainer = scrollContainerRef.current;
        const scrollTop = Math.max(scrollContainer?.scrollTop ?? 0, 0);
        if (scrollTop > 0) {
          if (deltaY <= scrollTop) return true;

          scrollContainer!.scrollTop = 0;
          pullDeltaY = deltaY - scrollTop;
        }
      }

      const pullProgress = Math.min(
        pullDistanceRef.current / PULL_TO_REFRESH_THRESHOLD,
        1,
      );
      const downwardResistance =
        PULL_TO_REFRESH_BASE_RESISTANCE -
        (PULL_TO_REFRESH_BASE_RESISTANCE - PULL_TO_REFRESH_MIN_RESISTANCE) *
          pullProgress;
      const adjustedDeltaY =
        pullDeltaY > 0
          ? pullDeltaY * downwardResistance
          : pullDeltaY * PULL_TO_REFRESH_BASE_RESISTANCE;
      const distance = Math.min(
        Math.max(0, pullDistanceRef.current + adjustedDeltaY),
        PULL_TO_REFRESH_THRESHOLD * 1.25,
      );
      pullDistanceRef.current = distance;
      const isArmed = distance >= PULL_TO_REFRESH_THRESHOLD;
      if (isArmed && !isPullToRefreshArmedRef.current) {
        triggerHapticFeedback(15);
      }
      isPullToRefreshArmedRef.current = isArmed;
      if (distance > 0) {
        isPullGestureActiveRef.current = true;
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.overflow = "hidden";
        }
      } else {
        isPullGestureActiveRef.current = false;
        scrollContainerRef.current?.style.removeProperty("overflow");
      }
      setPullDistance(distance);
      setPullToRefreshStatus(
        distance === 0
          ? "idle"
          : isArmed
            ? "armed"
            : "pulling",
      );
      return true;
    },
    [hasBlockingLayer, resetPullToRefresh],
  );

  const handlePullTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = pullStartRef.current;
      if (!start) return;

      if (event.touches.length !== 1) {
        resetPullToRefresh();
        return;
      }

      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === start.identifier,
      );
      if (!touch) return;

      updatePullDistance(touch);
      if (isPullGestureActiveRef.current && event.cancelable) {
        event.preventDefault();
      }
    },
    [resetPullToRefresh, updatePullDistance],
  );

  const handlePullTouchRefresh = useCallback(async () => {
    const shouldRefresh =
      !hasBlockingLayer &&
      pullDistanceRef.current >= PULL_TO_REFRESH_THRESHOLD &&
      !isPullRefreshingRef.current;
    const refreshHandler = pullToRefreshHandlersRef.current[selectedTab];

    if (!shouldRefresh || !refreshHandler) {
      resetPullToRefresh();
      return;
    }

    pullStartRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    isPullRefreshingRef.current = true;
    const requestId = pullRefreshRequestIdRef.current + 1;
    pullRefreshRequestIdRef.current = requestId;
    clearPullRefreshSlowWarning();
    pullSlowRequestTimeoutRef.current = window.setTimeout(() => {
      if (
        pullRefreshRequestIdRef.current === requestId &&
        isPullRefreshingRef.current
      ) {
        setIsPullRefreshSlow(true);
      }
    }, PULL_TO_REFRESH_SLOW_REQUEST_MS);
    setPullToRefreshStatus("refreshing");

    try {
      // 진행 중 세션(미니바·참여 알림 바)도 함께 새로 읽는다. reload는 실패해도 throw하지 않는다
      await Promise.all([refreshHandler(), liveSessionState.reload()]);
      if (pullRefreshRequestIdRef.current !== requestId) return;
      clearPullRefreshSlowWarning();
      schedulePullToRefreshReset("refreshing", 350);
    } catch {
      if (pullRefreshRequestIdRef.current !== requestId) return;
      clearPullRefreshSlowWarning();
      schedulePullToRefreshReset("error", 1600);
    }
  }, [
    hasBlockingLayer,
    clearPullRefreshSlowWarning,
    liveSessionState,
    resetPullToRefresh,
    schedulePullToRefreshReset,
    selectedTab,
  ]);

  const handlePullTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = pullStartRef.current;
      if (!start) return;

      const endingTouch = Array.from(event.changedTouches).find(
        (touch) => touch.identifier === start.identifier,
      );
      if (!endingTouch || !updatePullDistance(endingTouch)) return;

      void handlePullTouchRefresh();
    },
    [handlePullTouchRefresh, updatePullDistance],
  );

  const navigationContextValue = useMemo(
    () => ({
      selectedTab,
      depthStacks,
      pushDepth,
      closeDepth,
      requestCloseTopDepth,
      saveScrollPosition,
      restoreScrollTop,
      scrollToTop,
      getScrollTop,
      registerScrollContainer,
      registerPullToRefresh,
    }),
    [
      closeDepth,
      depthStacks,
      getScrollTop,
      pushDepth,
      requestCloseTopDepth,
      registerScrollContainer,
      registerPullToRefresh,
      restoreScrollTop,
      saveScrollPosition,
      scrollToTop,
      selectedTab,
    ],
  );

  const appNavigationContextValue = useMemo<AppNavigationContextValue>(
    () => ({
      selectTab,
      openMatchDetail,
      openMemberProfile,
      openRecordMatch,
      openCreateSession,
      openSettings,
      openSessionReport,
      sessionReportRequest,
      notifyDataChanged,
      dataVersion,
    }),
    [
      dataVersion,
      notifyDataChanged,
      openCreateSession,
      openMatchDetail,
      openMemberProfile,
      openRecordMatch,
      openSessionReport,
      openSettings,
      selectTab,
      sessionReportRequest,
    ],
  );

  const dockBottom =
    "bottom-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+8px)]";

  return (
    <TabNavigationProvider value={navigationContextValue}>
      <AppNavigationProvider value={appNavigationContextValue}>
        <LiveSessionProvider value={liveSessionState}>
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-pk-bg">
            <div
              ref={scrollContainerRef}
              className="app-tab-panel-scroll-area relative flex-1"
              onTouchMove={handlePullTouchMove}
              onTouchEnd={handlePullTouchEnd}
              onTouchCancel={() => resetPullToRefresh()}
            >
              <PullToRefreshIndicator
                distance={pullDistance}
                status={pullToRefreshStatus}
                threshold={PULL_TO_REFRESH_THRESHOLD}
              />
              {isPullRefreshSlow ? (
                <div className="absolute inset-x-0 top-14 z-30 px-3">
                  <Alert
                    status="warning"
                    className="items-center rounded-2xl border border-amber-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
                  >
                    <Alert.Indicator className="shrink-0 self-center" />
                    <Alert.Content className="min-w-0 gap-0 self-center">
                      <Alert.Title className="text-sm font-bold text-pk-sub">
                        응답이 지연되고 있어요.
                      </Alert.Title>
                      <Alert.Description className="text-xs font-semibold text-[#888]">
                        네트워크 연결 상태를 확인해주세요.
                      </Alert.Description>
                    </Alert.Content>
                    <CloseButton
                      className="shrink-0 self-center"
                      aria-label="지연 안내 닫기"
                      onClick={() => setIsPullRefreshSlow(false)}
                    />
                  </Alert>
                </div>
              ) : null}
              {/* 한 번 연 탭은 숨겨도 마운트를 유지한다(keep-alive) */}
              {TAB_ITEMS.map(({ key }) => {
                if (!visitedTabs[key]) return null;
                const TabPage = TAB_PAGES[key];

                return (
                  <div
                    key={key}
                    role="tabpanel"
                    id={getTabPanelId(key)}
                    aria-labelledby={getTabId(key)}
                    hidden={selectedTab !== key}
                    className={`min-h-full bg-pk-bg ${
                      key === "home" && isInstallPromptVisible
                        ? // 떠 있는 설치 안내가 마지막 콘텐츠를 가리지 않게 안내 높이만큼 더 띄운다
                          "pb-[calc(var(--app-bottom-dock-height)+6rem)]"
                        : "pb-[calc(var(--app-bottom-dock-height)+1rem)]"
                    }`}
                  >
                    <TabPage />
                  </div>
                );
              })}
            </div>

            {/* 바 뒤 콘텐츠가 흐려지며 끝나게 한다 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[calc(var(--app-bottom-dock-height)+var(--app-keyboard-offset)+5.5rem)] bg-[linear-gradient(to_bottom,rgba(243,245,249,0),#f3f5f9_62%)]"
            />

            <div
              className={`fixed left-1/2 z-20 flex app-shell-width -translate-x-1/2 flex-col gap-2.5 px-4 ${dockBottom}`}
            >
              {isMyMatchBarVisible && myInProgressMatch && player?.id ? (
                <MyMatchBar
                  match={myInProgressMatch}
                  playerId={player.id}
                  isActionDisabled={!isOnline}
                  onEnterScore={() =>
                    openRecordMatch({
                      kind: "score",
                      matchId: myInProgressMatch.id,
                    })
                  }
                />
              ) : null}
              {isJoinSessionBarVisible && liveSession ? (
                <JoinSessionBar
                  sessionName={liveSession.name}
                  isPending={isJoiningLiveSession}
                  hasError={joinLiveSessionError}
                  isActionDisabled={!isOnline || !player?.id}
                  onJoin={() => void joinLiveSession()}
                />
              ) : null}
              <div className="flex items-center gap-2.5">
                <NavPill selectedTab={selectedTab} onPressTab={handleTabPress} />
                {/* + 버튼 자리. 버튼은 dim 위에 올라와야 해서 따로 그린다 */}
                <div aria-hidden="true" className="size-[66px] shrink-0" />
              </div>
            </div>
          </div>

          <PwaInstallPrompt
            isActive={isHomeTabUncovered}
            onVisibleChange={setIsInstallPromptVisible}
          />

          <MatchDetailDrawer
            matchId={matchDetailLayer.value}
            tabKey={matchDetailLayer.tabKey}
            onClose={closeMatchDetail}
          />
          <MemberProfileDrawer
            playerId={memberProfileLayer.value}
            tabKey={memberProfileLayer.tabKey}
            onClose={closeMemberProfile}
          />
          <RecordMatchSheet
            request={recordMatchLayer.value}
            tabKey={recordMatchLayer.tabKey}
            onClose={closeRecordMatch}
          />
          <CreateSessionSheet
            isOpen={!!createSessionLayer.value}
            tabKey={createSessionLayer.tabKey}
            onClose={closeCreateSession}
            onCreated={handleSessionCreated}
          />
          <SettingsDrawer
            isOpen={!!settingsLayer.value}
            tabKey={settingsLayer.tabKey}
            onClose={closeSettings}
          />

          {typeof document !== "undefined"
            ? createPortal(
                <>
                  <button
                    type="button"
                    aria-label="새로 만들기 메뉴 닫기"
                    aria-hidden={!isGlobalMenuVisible}
                    tabIndex={-1}
                    onClick={() => closeGlobalMenu()}
                    className={`fixed inset-0 z-50 cursor-default bg-[rgba(15,23,42,0.3)] transition-opacity duration-[84ms] ease-out ${
                      isGlobalMenuVisible
                        ? "opacity-100"
                        : "pointer-events-none opacity-0"
                    }`}
                  />
                  <div
                    className={`pointer-events-none fixed left-1/2 flex app-shell-width -translate-x-1/2 justify-end px-4 ${dockBottom} ${
                      isGlobalMenuVisible ? "z-[60]" : "z-40"
                    }`}
                  >
                    <div className="pointer-events-auto">
                      <PlusMenu
                        isOpen={isGlobalMenuVisible}
                        isDisabled={!isOnline}
                        onToggle={() =>
                          isGlobalMenuVisible
                            ? closeGlobalMenu()
                            : openGlobalMenu()
                        }
                        onRecordMatch={() =>
                          closeGlobalMenu(() => openRecordMatch({ kind: "new" }))
                        }
                        onCreateSession={() =>
                          closeGlobalMenu(openCreateSession)
                        }
                      />
                    </div>
                  </div>
                </>,
                document.body,
              )
            : null}
        </LiveSessionProvider>
      </AppNavigationProvider>
    </TabNavigationProvider>
  );
};

export default BottomNav;
