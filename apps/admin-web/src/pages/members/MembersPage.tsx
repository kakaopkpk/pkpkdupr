import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  AdminPlayer,
  Player,
  PlayerCreationLog,
  PlayerStatusChangeLog,
} from "@pkpkdupr/shared/player";
import {
  fetchAdminPlayers,
  fetchPlayerCreationLogs,
  fetchPlayerStatusLogs,
} from "../../api/players";
import { fetchRankings } from "../../api/ratings";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ListWithPanel } from "../../components/ui/ListWithPanel";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchField } from "../../components/ui/SearchField";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ToggleChip } from "../../components/ui/ToggleChip";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import {
  membersPath,
  parseMembersParams,
  type MemberKindFilter,
  type MembersRouteParams,
} from "../../lib/adminRoutes";
import { AddMemberDialog } from "./AddMemberDialog";
import { GuestPanel } from "./GuestPanel";
import { IssuedCredentialCard } from "./IssuedCredentialCard";
import { MemberPanel } from "./MemberPanel";
import { MembersTable } from "./MembersTable";
import {
  DEFAULT_SORT,
  KIND_LABEL,
  countByKind,
  filterMembers,
  getErrorMessage,
  isAwaitingFirstPasswordChange,
  sortMembers,
  toRankMap,
  toggleSort,
  type IssuedCredential,
  type RankInfo,
  type SortKey,
  type SortState,
} from "./memberModel";
import type { PanelCallbacks } from "./panelParts";

interface MembersData {
  players: AdminPlayer[];
  creationLogs: Record<string, PlayerCreationLog[]>;
  statusLogs: Record<string, PlayerStatusChangeLog[]>;
  ranks: RankInfo;
}

// 순위는 패널의 보조 정보라 불러오지 못해도 화면을 막지 않는다
const fetchRankMap = (category: "doubles" | "singles") =>
  fetchRankings(category)
    .then(toRankMap)
    .catch(() => new Map<string, number>());

const loadMembersData = async (): Promise<MembersData> => {
  const [players, creationLogs, statusLogs, doubles, singles] = await Promise.all([
    fetchAdminPlayers(),
    fetchPlayerCreationLogs(),
    fetchPlayerStatusLogs(),
    fetchRankMap("doubles"),
    fetchRankMap("singles"),
  ]);
  return { players, creationLogs, statusLogs, ranks: { doubles, singles } };
};

const KIND_FILTERS: MemberKindFilter[] = ["all", "member", "guest", "inactive"];

const MembersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { player: me } = useAuth();

  const params = parseMembersParams(searchParams);
  const kind = params.kind ?? "all";
  const firstLoginOnly = params.firstLogin === true;
  const selectedPlayerId = params.playerId;

  const [data, setData] = useState<MembersData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [credential, setCredential] = useState<IssuedCredential | null>(null);
  const requestIdRef = useRef(0);
  const hasDataRef = useRef(false);

  /** 늦게 도착한 이전 응답이 새 응답을 덮지 않게 마지막 요청만 반영한다. throw하지 않는다 */
  const reload = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    try {
      const next = await loadMembersData();
      if (requestId !== requestIdRef.current) return;
      hasDataRef.current = true;
      setData(next);
      setLoadError(null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      // 처음 불러오기 실패는 화면에, 이미 목록이 있으면 토스트로 알린다
      if (hasDataRef.current) {
        showToast(`회원 목록을 다시 불러오지 못했어요. ${getErrorMessage(error)}`);
      } else {
        setLoadError(getErrorMessage(error));
      }
    }
  }, [showToast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 비동기 작업 뒤에 불려도 그 시점 쿼리를 기준으로 고치도록 함수형 갱신을 쓴다
  const updateParams = useCallback(
    (patch: Partial<MembersRouteParams>) => {
      setSearchParams(
        (prev) => {
          const path = membersPath({ ...parseMembersParams(prev), ...patch });
          return new URLSearchParams(path.split("?")[1] ?? "");
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const players = useMemo(() => data?.players ?? [], [data]);
  const counts = useMemo(() => countByKind(players), [players]);
  const firstLoginCount = useMemo(
    () => players.filter(isAwaitingFirstPasswordChange).length,
    [players],
  );
  const visiblePlayers = useMemo(
    () => sortMembers(filterMembers(players, { query, kind, firstLoginOnly }), sort),
    [players, query, kind, firstLoginOnly, sort],
  );
  const selectedPlayer = selectedPlayerId
    ? players.find((player) => player.id === selectedPlayerId)
    : undefined;

  const selectPlayer = (playerId: string | undefined) => {
    if (playerId !== credential?.playerId) setCredential(null);
    updateParams({ playerId, add: undefined });
  };

  const handleAdded = async (player: Player) => {
    showToast(`${player.username}를 추가했어요`);
    await reload();
    setCredential({ playerId: player.id, username: player.username, kind: "created" });
    updateParams({ playerId: player.id, add: undefined });
  };

  const renderPanel = () => {
    if (!selectedPlayer || !data) return null;
    const callbacks: PanelCallbacks = {
      reload,
      onIssued: (issuedKind) =>
        setCredential({
          playerId: selectedPlayer.id,
          username: selectedPlayer.username,
          kind: issuedKind,
        }),
      onDeleted: (username) => {
        setCredential(null);
        updateParams({ playerId: undefined });
        showToast(`${username}를 지웠어요`);
        void reload();
      },
    };
    const topSlot =
      credential?.playerId === selectedPlayer.id ? (
        <IssuedCredentialCard credential={credential} onDismiss={() => setCredential(null)} />
      ) : null;
    const isSelf = me?.id === selectedPlayer.id;
    const onClose = () => selectPlayer(undefined);

    // key로 회원이 바뀌면 입력 초안을 새로 시작한다
    return selectedPlayer.isGuest ? (
      <GuestPanel
        key={selectedPlayer.id}
        player={selectedPlayer}
        isSelf={isSelf}
        topSlot={topSlot}
        callbacks={callbacks}
        onClose={onClose}
      />
    ) : (
      <MemberPanel
        key={selectedPlayer.id}
        player={selectedPlayer}
        creationLogs={data.creationLogs[selectedPlayer.id]}
        statusLogs={data.statusLogs[selectedPlayer.id]}
        ranks={data.ranks}
        isSelf={isSelf}
        topSlot={topSlot}
        callbacks={callbacks}
        onClose={onClose}
      />
    );
  };

  const renderList = () => {
    if (!data) {
      return loadError ? (
        <Card className="flex items-center justify-between gap-4 text-pk-15 text-pk-sub">
          <span>회원 목록을 불러오지 못했어요. {loadError}</span>
          <Button variant="soft" onClick={() => void reload()}>
            다시 시도
          </Button>
        </Card>
      ) : (
        <Card className="text-pk-15 text-pk-sub">회원 목록을 불러오는 중…</Card>
      );
    }
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="아이디 검색"
            className="w-56"
          />
          <SegmentedControl<MemberKindFilter>
            ariaLabel="구분"
            value={kind}
            onChange={(next) => updateParams({ kind: next })}
            options={KIND_FILTERS.map((value) => ({
              value,
              label: (
                <>
                  {value === "all" ? "전체" : KIND_LABEL[value]}
                  <span className="ml-1 tabular-nums text-pk-muted">{counts[value]}</span>
                </>
              ),
            }))}
          />
          <ToggleChip
            pressed={firstLoginOnly}
            onChange={(pressed) => updateParams({ firstLogin: pressed || undefined })}
          >
            첫 비밀번호 변경 전 <span className="tabular-nums">{firstLoginCount}</span>
          </ToggleChip>
          <span className="ml-auto text-pk-13 font-semibold tabular-nums text-pk-sub">
            {visiblePlayers.length}명
          </span>
        </div>
        <MembersTable
          players={visiblePlayers}
          selectedPlayerId={selectedPlayer?.id}
          sort={sort}
          onSort={(key: SortKey) => setSort((current) => toggleSort(current, key))}
          onSelect={(playerId) => selectPlayer(playerId)}
        />
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="회원"
        actions={<Button onClick={() => updateParams({ add: true })}>+ 회원 추가</Button>}
      />
      <ListWithPanel list={renderList()} panel={renderPanel()} />
      <AddMemberDialog
        open={params.add === true}
        players={players}
        onClose={() => updateParams({ add: undefined })}
        onAdded={handleAdded}
        onOpenGuest={(playerId) => selectPlayer(playerId)}
      />
    </>
  );
};

export default MembersPage;
