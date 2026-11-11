import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Alert,
  Button,
  CloseButton,
  Dropdown,
  Label,
  Separator,
  Tabs,
} from "@heroui/react";
import {
  IoAdd,
  IoAddCircleOutline,
  IoLogOutOutline,
  IoPeople,
  IoPeopleOutline,
  IoPersonCircle,
  IoPersonCircleOutline,
  IoSettingsOutline,
  IoTennisball,
  IoTennisballOutline,
} from "react-icons/io5";
import AppSettingsSheetBody from "@/components/AppSettingsSheetBody";
import BottomSheet from "@/components/BottomSheet";
import HoldToConfirmButton from "@/components/HoldToConfirmButton";
import RecordMatchDrawerBody from "@/components/RecordMatchDrawerBody";
import ProfileMatchDetailDrawer from "@/components/ProfileMatchDetailDrawer";
import PullToRefreshIndicator, {
  type PullToRefreshStatus,
} from "@/components/PullToRefreshIndicator";
import { useAuth } from "@/context/AuthContext";
import {
  TabNavigationProvider,
  type TabDepthEntry,
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
import { DEFAULT_THEME_COLOR, DIMMED_THEME_COLOR } from "@/lib/themeColor";
import Matches from "@/pages/Matches";
import Members from "@/pages/Members";
import Me from "@/pages/Me";

const TAB_KEYS: TabKey[] = ["match", "members", "me"];
const TAB_THEME_COLOR_MAP: Record<TabKey, string> = {
  match: DEFAULT_THEME_COLOR,
  members: DEFAULT_THEME_COLOR,
  me: DEFAULT_THEME_COLOR,
};

const emptyDepthStacks = (): TabDepthStacks => ({
  match: [],
  members: [],
  me: [],
});

const initiallyVisitedTabs = (): Record<TabKey, boolean> => ({
  match: false,
  members: false,
  me: true,
});

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

const BottomNav: React.FC = () => {
  const { logout, player } = useAuth();
  const isOnline = useOnlineStatus();
  const [selectedTab, setSelectedTab] = useState<TabKey>("me");
  const [visitedTabs, setVisitedTabs] =
    useState<Record<TabKey, boolean>>(initiallyVisitedTabs);
  const [depthStacks, setDepthStacks] =
    useState<TabDepthStacks>(emptyDepthStacks);
  const [isGlobalMenuOpen, setIsGlobalMenuOpen] = useState(false);
  const [globalMenuTabKey, setGlobalMenuTabKey] = useState<TabKey>("me");
  const [isCreateMatchOpen, setIsCreateMatchOpen] = useState(false);
  // 열 때마다 올려서 기록 시트를 초기 상태로 리마운트한다
  const [createMatchSheetKey, setCreateMatchSheetKey] = useState(0);
  const [createMatchTabKey, setCreateMatchTabKey] = useState<TabKey>("me");
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [appSettingsTabKey, setAppSettingsTabKey] = useState<TabKey>("me");
  const [matchesReloadKey, setMatchesReloadKey] = useState(0);
  const [deepLinkMatchId, setDeepLinkMatchId] = useState<string | null>(
    getDeepLinkMatchId,
  );
  const [deepLinkMatchTabKey, setDeepLinkMatchTabKey] =
    useState<TabKey>("me");
  const [pullDistance, setPullDistance] = useState(0);
  const [pullToRefreshStatus, setPullToRefreshStatus] =
    useState<PullToRefreshStatus>("idle");
  const [isPullRefreshSlow, setIsPullRefreshSlow] = useState(false);
  const handledDeepLinkMatchIdRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const depthScrollContainersRef = useRef(
    new Map<string, HTMLDivElement>(),
  );
  const selectedTabRef = useRef<TabKey>(selectedTab);
  const depthEntriesRef = useRef<Record<TabKey, TabDepthEntry[]>>({
    match: [],
    members: [],
    me: [],
  });
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
      match: depthEntriesRef.current.match.map((entry) => entry.id),
      members: depthEntriesRef.current.members.map((entry) => entry.id),
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

  const handleSelectionChange = useCallback(
    (key: React.Key) => {
      selectTab(String(key) as TabKey);
    },
    [selectTab],
  );

  const clearDeepLinkMatchIdFromUrl = useCallback((matchId: string) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(DEEP_LINK_MATCH_ID_PARAM) !== matchId) return;

    url.searchParams.delete(DEEP_LINK_MATCH_ID_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useEffect(() => {
    if (
      !deepLinkMatchId ||
      handledDeepLinkMatchIdRef.current === deepLinkMatchId
    ) {
      return;
    }

    const targetMatchId = deepLinkMatchId;
    const targetTabKey = selectedTabRef.current;
    const depthId = `deep-link-match-detail:${targetMatchId}`;
    const linkedUrl = window.location.href;

    // Keep a clean history entry underneath the drawer. The depth entry then
    // retains the shareable URL, so closing it with the app back button or the
    // browser back gesture removes matchId instead of reopening the drawer.
    window.history.replaceState(
      window.history.state,
      "",
      getUrlWithoutDeepLinkMatchId(),
    );

    handledDeepLinkMatchIdRef.current = targetMatchId;
    setDeepLinkMatchTabKey(targetTabKey);
    saveScrollPosition(targetTabKey);
    pushDepth(targetTabKey, {
      id: depthId,
      kind: "match-detail",
      onClose: () => {
        handledDeepLinkMatchIdRef.current = null;
        clearDeepLinkMatchIdFromUrl(targetMatchId);
        setDeepLinkMatchId((current) =>
          current === targetMatchId ? null : current,
        );
        restoreScrollTop(targetTabKey);
      },
    });
    window.history.replaceState(window.history.state, "", linkedUrl);
  }, [
    clearDeepLinkMatchIdFromUrl,
    deepLinkMatchId,
    pushDepth,
    restoreScrollTop,
    saveScrollPosition,
  ]);

  // Capture the pre-selection tab before HeroUI handles the press so moving to
  // a tab cannot be mistaken for a re-tap.
  const handleActiveTabPointerDown = useCallback(
    (tabKey: TabKey) => {
      if (selectedTabRef.current !== tabKey) return;

      if (getScrollTop() > 0) {
        scrollToTop("smooth");
        return;
      }

      requestCloseTopDepth(tabKey);
    },
    [getScrollTop, requestCloseTopDepth, scrollToTop],
  );

  const openGlobalMenu = useCallback(() => {
    const tabKey = selectedTabRef.current;
    setGlobalMenuTabKey(tabKey);
    pushDepth(tabKey, {
      id: "global-menu",
      kind: "dropdown",
      onClose: () => setIsGlobalMenuOpen(false),
    });
    setIsGlobalMenuOpen(true);
  }, [pushDepth]);

  const openCreateMatchSheet = useCallback(() => {
    const tabKey = selectedTabRef.current;
    setCreateMatchTabKey(tabKey);
    setCreateMatchSheetKey((prev) => prev + 1);
    pushDepth(tabKey, {
      id: "create-match-sheet",
      kind: "bottom-sheet",
      onClose: () => setIsCreateMatchOpen(false),
    });
    setIsCreateMatchOpen(true);
  }, [pushDepth]);

  const openAppSettingsSheet = useCallback(() => {
    const tabKey = selectedTabRef.current;
    setAppSettingsTabKey(tabKey);
    pushDepth(tabKey, {
      id: "app-settings-sheet",
      kind: "bottom-sheet",
      onClose: () => setIsAppSettingsOpen(false),
    });
    setIsAppSettingsOpen(true);
  }, [pushDepth]);

  const handleGlobalMenuOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        openGlobalMenu();
        return;
      }

      closeDepth(globalMenuTabKey, "global-menu");
      setIsGlobalMenuOpen(false);
    },
    [closeDepth, globalMenuTabKey, openGlobalMenu],
  );

  const handleCreateMatchOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        openCreateMatchSheet();
        return;
      }

      closeDepth(createMatchTabKey, "create-match-sheet");
      setIsCreateMatchOpen(false);
    },
    [closeDepth, createMatchTabKey, openCreateMatchSheet],
  );

  const handleAppSettingsOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        openAppSettingsSheet();
        return;
      }

      closeDepth(appSettingsTabKey, "app-settings-sheet");
      setIsAppSettingsOpen(false);
    },
    [appSettingsTabKey, closeDepth, openAppSettingsSheet],
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

  const handleGlobalAction = (key: React.Key) => {
    const action = () => {
      switch (String(key)) {
        case "create-match":
          if (!isOnline) return;
          openCreateMatchSheet();
          break;
        case "settings":
          openAppSettingsSheet();
          break;
        default:
          break;
      }
    };

    if (!closeDepth(globalMenuTabKey, "global-menu", action)) {
      setIsGlobalMenuOpen(false);
      action();
    }
  };

  const handleLogout = useCallback(() => {
    const action = () => {
      void logout();
    };

    if (!closeDepth(globalMenuTabKey, "global-menu", action)) {
      setIsGlobalMenuOpen(false);
      action();
    }
  }, [closeDepth, globalMenuTabKey, logout]);

  const handleRecordMatch = useCallback(() => {
    setMatchesReloadKey((prev) => prev + 1);
  }, []);

  const handleRecordMatchDone = () => {
    if (
      !closeDepth(createMatchTabKey, "create-match-sheet", () =>
        selectTab("match"),
      )
    ) {
      setIsCreateMatchOpen(false);
      selectTab("match");
    }
  };

  const handleCancelCreateMatch = () => {
    if (!closeDepth(createMatchTabKey, "create-match-sheet")) {
      setIsCreateMatchOpen(false);
    }
  };

  const isGlobalMenuVisible =
    isGlobalMenuOpen && globalMenuTabKey === selectedTab;
  const hasActiveBottomSheet = depthEntriesRef.current[selectedTab].some(
    (entry) => entry.kind === "bottom-sheet",
  );
  const isDimmedOverlayVisible =
    hasActiveBottomSheet ||
    isGlobalMenuVisible ||
    (isCreateMatchOpen && createMatchTabKey === selectedTab) ||
    (isAppSettingsOpen && appSettingsTabKey === selectedTab);
  const hasBlockingLayer = useMemo(() => {
    const activeDepthEntries = depthEntriesRef.current[selectedTab];
    const hasBlockingDepth = activeDepthEntries.some(
      (entry) => entry.kind === "bottom-sheet" || entry.kind === "dropdown",
    );

    return (
      hasBlockingDepth ||
      isGlobalMenuVisible ||
      (isCreateMatchOpen && createMatchTabKey === selectedTab) ||
      (isAppSettingsOpen && appSettingsTabKey === selectedTab)
    );
  }, [
    appSettingsTabKey,
    createMatchTabKey,
    depthStacks,
    isAppSettingsOpen,
    isCreateMatchOpen,
    isGlobalMenuVisible,
    selectedTab,
  ]);

  const deepLinkMatchDepthId = deepLinkMatchId
    ? `deep-link-match-detail:${deepLinkMatchId}`
    : null;
  const isDeepLinkMatchDrawerOpen =
    !!deepLinkMatchDepthId &&
    depthStacks[deepLinkMatchTabKey].includes(deepLinkMatchDepthId);
  const registerDeepLinkMatchScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      if (!deepLinkMatchDepthId) return;
      registerScrollContainer(
        deepLinkMatchTabKey,
        deepLinkMatchDepthId,
        element,
      );
    },
    [deepLinkMatchDepthId, deepLinkMatchTabKey, registerScrollContainer],
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );

    if (!themeColorMeta) {
      return;
    }

    themeColorMeta.setAttribute(
      "content",
      isDimmedOverlayVisible
        ? DIMMED_THEME_COLOR
        : TAB_THEME_COLOR_MAP[selectedTab],
    );

    return () => {
      themeColorMeta.setAttribute("content", DEFAULT_THEME_COLOR);
    };
  }, [isDimmedOverlayVisible, selectedTab]);

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
      await refreshHandler();
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

  return (
    <TabNavigationProvider value={navigationContextValue}>
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={handleSelectionChange}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white pb-[var(--safe-bottom)]"
      >
        <div className="fixed bottom-[calc(var(--safe-bottom)+var(--app-keyboard-offset))] left-1/2 z-20 flex app-shell-width -translate-x-1/2 items-end px-3 pb-3 pt-3">
          <Tabs.ListContainer className="mr-[5.07rem] min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none backdrop-blur-0">
            <Tabs.List
              aria-label="Bottom navigation"
              className="grid grid-cols-3 gap-1 rounded-full shadow-[0_3px_10px_rgba(15,23,42,0.12)] *:min-w-0"
            >
              <Tabs.Tab
                id="match"
                onPointerDownCapture={() =>
                  handleActiveTabPointerDown("match")
                }
                className="min-h-[3.2rem] w-full first:rounded-l-full last:rounded-r-full text-default-500 data-[selected=true]:text-pkpk-primary-bg"
              >
                <div className="flex flex-col items-center gap-1 py-1.5">
                  {selectedTab === "match" ? (
                    <IoTennisball className="text-lg" />
                  ) : (
                    <IoTennisballOutline className="text-lg" />
                  )}
                  <span className="text-[13.2px] leading-none">Matches</span>
                </div>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab
                id="members"
                onPointerDownCapture={() =>
                  handleActiveTabPointerDown("members")
                }
                className="min-h-[3.2rem] w-full text-default-500 data-[selected=true]:text-pkpk-primary-bg"
              >
                <div className="flex flex-col items-center gap-1 py-1.5">
                  {selectedTab === "members" ? (
                    <IoPeople className="text-lg" />
                  ) : (
                    <IoPeopleOutline className="text-lg" />
                  )}
                  <span className="text-[13.2px] leading-none">Members</span>
                </div>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab
                id="me"
                onPointerDownCapture={() => handleActiveTabPointerDown("me")}
                className="min-h-[3.2rem] w-full first:rounded-l-full last:rounded-r-full text-default-500 data-[selected=true]:text-pkpk-primary-bg"
              >
                <div className="flex flex-col items-center gap-1 py-1.5">
                  {selectedTab === "me" ? (
                    <IoPersonCircle className="text-lg" />
                  ) : (
                    <IoPersonCircleOutline className="text-lg" />
                  )}
                  <span className="text-[13.2px] leading-none">Me</span>
                </div>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>

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
                  <Alert.Title className="text-sm font-bold text-pkpk-sub-font">
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
          <Tabs.Panel
            id="match"
            shouldForceMount={visitedTabs.match}
            className="min-h-full bg-pkpk-bg p-0 pb-[calc(5rem+var(--safe-bottom))] data-[inert=true]:hidden"
          >
            <Matches reloadKey={matchesReloadKey} />
          </Tabs.Panel>
          <Tabs.Panel
            id="members"
            shouldForceMount={visitedTabs.members}
            className="min-h-full bg-pkpk-bg p-0 pb-[calc(5rem+var(--safe-bottom))] data-[inert=true]:hidden"
          >
            <Members />
          </Tabs.Panel>
          <Tabs.Panel
            id="me"
            shouldForceMount={visitedTabs.me}
            className="min-h-full bg-pkpk-bg p-0 pb-[calc(5rem+var(--safe-bottom))] data-[inert=true]:hidden"
          >
            <Me />
          </Tabs.Panel>
          {/* <div
            aria-hidden="true"
            className="h-[calc(5.5rem+env(safe-area-inset-bottom))] shrink-0"
          /> */}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[calc(5.5rem+env(safe-area-inset-bottom)+var(--app-keyboard-offset))] bg-gradient-to-t from-white via-white/100 to-transparent"
        />

      </Tabs>
      <BottomSheet
        isOpen={isCreateMatchOpen}
        isActive={createMatchTabKey === selectedTab}
        onOpenChange={handleCreateMatchOpenChange}
        ariaLabel="Record match"
      >
        <RecordMatchDrawerBody
          key={createMatchSheetKey}
          isOnline={isOnline}
          onCancel={handleCancelCreateMatch}
          onRecorded={handleRecordMatch}
          onDone={handleRecordMatchDone}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={isAppSettingsOpen}
        isActive={appSettingsTabKey === selectedTab}
        onOpenChange={handleAppSettingsOpenChange}
        ariaLabel="앱 설정"
      >
        <AppSettingsSheetBody />
      </BottomSheet>
      {deepLinkMatchId && deepLinkMatchDepthId ? (
        <ProfileMatchDetailDrawer
          isOpen={isDeepLinkMatchDrawerOpen}
          isActive={deepLinkMatchTabKey === selectedTab}
          tabKey={deepLinkMatchTabKey}
          match={null}
          matchId={deepLinkMatchId}
          currentPlayerId={player?.id}
          onExited={() => undefined}
          onScrollContainerChange={registerDeepLinkMatchScrollContainer}
          layer={70}
        />
      ) : null}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              className={`pointer-events-none fixed bottom-[calc(var(--safe-bottom)+var(--app-keyboard-offset)+0.75rem)] left-1/2 flex app-shell-width -translate-x-1/2 justify-end px-3 ${
                isGlobalMenuVisible ? "z-[60]" : "z-40"
              }`}
            >
              <div className="pointer-events-auto">
                <Dropdown
                  isOpen={isGlobalMenuVisible}
                  onOpenChange={handleGlobalMenuOpenChange}
                >
                  <Button
                    isIconOnly
                    aria-label="Global plus menu"
                    className={`h-[4.32rem] w-[4.32rem] shrink-0 rounded-full text-white shadow-[0_3px_10px_rgba(15,23,42,0.22)] transition-colors duration-[84ms] ${
                      isGlobalMenuVisible
                        ? "bg-[#f8626c] hover:bg-[#f8626c]/90"
                        : "bg-pkpk-primary-bg hover:bg-pkpk-primary-bg/90"
                    }`}
                  >
                    <IoAdd
                      className={`h-7 w-7 shrink-0 transition-transform duration-[84ms] ${
                        isGlobalMenuVisible ? "rotate-45" : "rotate-0"
                      }`}
                      style={{ width: "33.6px", height: "33.6px" }}
                    />
                  </Button>
                  <Dropdown.Popover
                    className="global-plus-menu-popover relative z-[70] min-w-[194px] overflow-visible border-0 bg-transparent p-0 shadow-none"
                    offset={12}
                    placement="top end"
                  >
                    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
                      <div className="px-1.5 py-1.5">
                        <HoldToConfirmButton
                          holdDurationMs={1000}
                          ariaLabel="길게 눌러 로그아웃"
                          onComplete={handleLogout}
                          className="rounded-lg text-[#f8626c] hover:bg-[#f8626c]/6"
                          progressClassName="bg-[#f8626c]/18"
                        >
                          <IoLogOutOutline className="size-4 shrink-0 text-[#f8626c]" />
                          <span className="truncate text-[1.05rem] font-medium leading-5 text-[#f8626c]">
                            길게 눌러 로그아웃
                          </span>
                        </HoldToConfirmButton>
                      </div>
                      <Separator className="mx-[3%] w-[94%]" />
                      <Dropdown.Menu
                        onAction={handleGlobalAction}
                        className="bg-transparent"
                      >
                        <Dropdown.Item
                          id="settings"
                          textValue="Settings"
                          className="data-[focused]:bg-pkpk-primary-bg/5 data-[hovered]:bg-pkpk-primary-bg/5"
                        >
                          <IoSettingsOutline className="size-4 shrink-0 text-pkpk-sub-font" />
                          <Label className="text-[1.05rem] font-medium leading-5">
                            설정
                          </Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </div>
                    <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
                      <Dropdown.Menu
                        onAction={handleGlobalAction}
                        className="bg-transparent"
                      >
                        <Dropdown.Item
                          id="create-match"
                          textValue="Record match"
                          isDisabled={!isOnline}
                          className="data-[focused]:bg-pkpk-primary-bg/5 data-[hovered]:bg-pkpk-primary-bg/5"
                        >
                          <IoAddCircleOutline className="size-4 shrink-0 text-pkpk-sub-font" />
                          <Label className="text-[1.05rem] font-medium leading-5">
                            경기 기록
                          </Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </div>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
            </div>,
            document.body,
          )
        : null}
      {typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              aria-label="전역 메뉴 닫기"
              aria-hidden={!isGlobalMenuVisible}
              tabIndex={-1}
              onClick={() => handleGlobalMenuOpenChange(false)}
              className={`fixed inset-0 z-50 cursor-default bg-black/30 backdrop-blur-sm transition-opacity duration-[84ms] ease-out ${
                isGlobalMenuVisible
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />,
            document.body,
          )
        : null}
    </TabNavigationProvider>
  );
};

export default BottomNav;
