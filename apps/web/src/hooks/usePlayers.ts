import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { MemberListPlayer } from "@pkpkdupr/shared/player";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { CACHED_MEMBERS_KEY } from "@/lib/userCache";

export type MemberListPlayerInfo = Omit<
  MemberListPlayer,
  "createdAt" | "updatedAt" | "lastPlayedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
};

type PlayersStatus = "loading" | "ready" | "error";

interface PlayersState {
  /** 이 상태를 채운 로그인 회원. 계정이 바뀌면 상태를 버린다 */
  ownerId: string | null;
  players: MemberListPlayerInfo[];
  status: PlayersStatus;
}

const INITIAL_STATE: PlayersState = {
  ownerId: null,
  players: [],
  status: "loading",
};

// 여러 화면이 같은 회원 목록을 쓰므로 모듈 단위로 한 벌만 둔다.
let state: PlayersState = INITIAL_STATE;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (next: PlayersState) => {
  state = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const readCachedPlayers = (): MemberListPlayerInfo[] | null => {
  try {
    const cached = localStorage.getItem(CACHED_MEMBERS_KEY);
    return cached ? (JSON.parse(cached) as MemberListPlayerInfo[]) : null;
  } catch {
    return null;
  }
};

const writeCachedPlayers = (players: MemberListPlayerInfo[]) => {
  try {
    localStorage.setItem(CACHED_MEMBERS_KEY, JSON.stringify(players));
  } catch {
    // 저장소가 막혀 있어도 메모리 목록은 쓸 수 있다.
  }
};

/** 계정이 바뀌었으면 이전 목록을 버리고, 같은 계정의 오프라인 캐시가 있으면 먼저 보여 준다 */
const ensureOwner = (ownerId: string) => {
  if (state.ownerId === ownerId) return;
  inFlight = null;
  const cached = readCachedPlayers();
  setState({
    ownerId,
    players: cached ?? [],
    status: cached ? "ready" : "loading",
  });
};

const fetchPlayers = (ownerId: string): Promise<void> => {
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const res = await apiFetch("/api/players");
      if (!res.ok) {
        throw new Error(`GET /api/players ${res.status}`);
      }
      const players = (await res.json()) as MemberListPlayerInfo[];
      if (state.ownerId !== ownerId) return;
      writeCachedPlayers(players);
      setState({ ownerId, players, status: "ready" });
    } catch {
      if (state.ownerId !== ownerId) return;
      // 이미 보여 줄 목록(이전 응답·오프라인 캐시)이 있으면 그대로 둔다.
      if (state.players.length === 0) {
        setState({ ...state, status: "error" });
      }
    }
  })();

  inFlight = request;
  void request.finally(() => {
    if (inFlight === request) inFlight = null;
  });
  return request;
};

/** GET /api/players 회원 목록. 컴포넌트 간 메모리로 공유하고 localStorage에 캐시한다 */
export const usePlayers = (): {
  players: MemberListPlayerInfo[];
  status: PlayersStatus;
  reload: () => Promise<void>;
} => {
  const { player, isAuthenticated } = useAuth();
  const ownerId = isAuthenticated ? (player?.id ?? null) : null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const isCurrentOwner = ownerId !== null && snapshot.ownerId === ownerId;

  useEffect(() => {
    if (!ownerId) return;
    const isFirstLoad = state.ownerId !== ownerId;
    ensureOwner(ownerId);
    if (isFirstLoad) {
      void fetchPlayers(ownerId);
    }
  }, [ownerId]);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    ensureOwner(ownerId);
    await fetchPlayers(ownerId);
  }, [ownerId]);

  return {
    players: isCurrentOwner ? snapshot.players : INITIAL_STATE.players,
    status: isCurrentOwner ? snapshot.status : INITIAL_STATE.status,
    reload,
  };
};
