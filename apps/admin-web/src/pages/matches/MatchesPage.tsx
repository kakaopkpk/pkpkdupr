import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getMatchTopLevelType,
  type ManagedMatchSession,
  type Match,
  type MatchTopLevelType,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { fetchAdminMatches } from "../../api/matches";
import { fetchAdminPlayers } from "../../api/players";
import { fetchAdminSessions } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { cx } from "../../components/ui/cx";
import { ListWithPanel } from "../../components/ui/ListWithPanel";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchField } from "../../components/ui/SearchField";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { textInputClassName } from "../../components/ui/TextInput";
import { useToast } from "../../components/ui/Toast";
import { ToggleChip } from "../../components/ui/ToggleChip";
import {
  matchesPath,
  parseMatchesParams,
  type MatchesRouteParams,
} from "../../lib/adminRoutes";
import { formatKstMonthDay } from "../../lib/format";
import { MatchCorrectionPanel } from "./MatchCorrectionPanel";
import { MatchList } from "./MatchList";
import { compareMatchesLatestFirst, normalizeMatch, toDate } from "./matchView";

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

type PeriodFilter = "30d" | "7d" | "all";
type CategoryFilter = "all" | MatchTopLevelType;

const PERIOD_DAYS: Record<Exclude<PeriodFilter, "all">, number> = {
  "30d": 30,
  "7d": 7,
};

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: "30d", label: "최근 30일" },
  { value: "7d", label: "최근 7일" },
  { value: "all", label: "전체" },
];

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "doubles", label: "복식" },
  { value: "singles", label: "단식" },
];

interface MatchesData {
  matches: Match[];
  players: AdminPlayer[];
  sessions: ManagedMatchSession[];
}

const loadMatchesData = async (): Promise<MatchesData> => {
  const [matches, players, sessions] = await Promise.all([
    fetchAdminMatches(),
    fetchAdminPlayers(),
    fetchAdminSessions(),
  ]);
  return {
    matches: matches.map(normalizeMatch).sort(compareMatchesLatestFirst),
    players,
    sessions,
  };
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "경기를 불러오지 못했어요.";

const MatchesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const routeParams = useMemo(
    () => parseMatchesParams(new URLSearchParams(location.search)),
    [location.search],
  );

  const [data, setData] = useState<MatchesData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [excludedOnly, setExcludedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const reload = useCallback(async () => {
    const next = await loadMatchesData();
    setData(next);
    setLoadError(null);
  }, []);

  const initialLoad = useCallback(() => {
    setLoadError(null);
    reload().catch((error: unknown) => setLoadError(getErrorMessage(error)));
  }, [reload]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  // session·noSession·match는 URL과 맞물린다
  const updateRoute = (patch: Partial<MatchesRouteParams>) => {
    navigate(matchesPath({ ...routeParams, ...patch }), { replace: true });
  };

  const sessionFilterId = routeParams.sessionId ?? null;
  const noSessionOnly = routeParams.noSession === true;

  const filteredMatches = useMemo(() => {
    if (!data) return [];
    const keyword = memberQuery.trim().toLowerCase();
    // session 조건이 있으면 기간 조건은 무시한다
    const periodStart =
      sessionFilterId === null && period !== "all"
        ? Date.now() - PERIOD_DAYS[period] * DAY_MS
        : null;
    return data.matches.filter((match) => {
      if (sessionFilterId !== null && match.session?.id !== sessionFilterId) {
        return false;
      }
      if (periodStart !== null && toDate(match.matchStartsAt).getTime() < periodStart) {
        return false;
      }
      if (category !== "all" && getMatchTopLevelType(match.type) !== category) {
        return false;
      }
      if (excludedOnly && !match.ratingExcluded) return false;
      if (noSessionOnly && match.session) return false;
      if (
        keyword &&
        !match.teams.some((team) =>
          team.players.some((player) =>
            player.username.toLowerCase().includes(keyword),
          ),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [data, memberQuery, period, category, excludedOnly, noSessionOnly, sessionFilterId]);

  // 필터가 바뀌면 다시 50개부터 보인다
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [memberQuery, period, category, excludedOnly, noSessionOnly, sessionFilterId]);

  const visibleMatches = useMemo(
    () => filteredMatches.slice(0, visibleCount),
    [filteredMatches, visibleCount],
  );

  const sessionFilterLabel = useMemo(() => {
    if (sessionFilterId === null || !data) return null;
    const session =
      data.sessions.find((item) => item.id === sessionFilterId) ??
      data.matches.find((match) => match.session?.id === sessionFilterId)?.session;
    if (!session) return "알 수 없는 세션";
    return `${session.name ?? "이름 없는 세션"} ${formatKstMonthDay(toDate(session.date))}`;
  }, [data, sessionFilterId]);

  const selectedMatch = useMemo(
    () =>
      (routeParams.matchId &&
        data?.matches.find((match) => match.id === routeParams.matchId)) ||
      null,
    [data, routeParams.matchId],
  );

  const handleDeleted = () => {
    updateRoute({ matchId: undefined });
    showToast("경기를 지웠어요");
    reload().catch((error: unknown) => showToast(getErrorMessage(error)));
  };

  const filterBar = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <SearchField
        value={memberQuery}
        onChange={setMemberQuery}
        placeholder="회원으로 찾기"
        className="w-56"
      />
      <select
        aria-label="기간"
        value={period}
        disabled={sessionFilterId !== null}
        onChange={(event) => setPeriod(event.target.value as PeriodFilter)}
        className={cx(textInputClassName, "w-32 cursor-pointer")}
      >
        {PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <SegmentedControl
        ariaLabel="분류"
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={setCategory}
      />
      <ToggleChip pressed={excludedOnly} onChange={setExcludedOnly}>
        평점 미반영
      </ToggleChip>
      <ToggleChip
        pressed={noSessionOnly}
        onChange={(pressed) => updateRoute({ noSession: pressed || undefined })}
      >
        세션 없는 경기
      </ToggleChip>
      {sessionFilterLabel && (
        <span className="inline-flex h-10 items-center gap-1 rounded-full bg-pk-primary-soft pl-4 pr-1.5 text-pk-13 font-bold text-pk-primary">
          {sessionFilterLabel}
          <button
            type="button"
            aria-label="세션 조건 풀기"
            onClick={() => updateRoute({ sessionId: undefined })}
            className="flex size-7 items-center justify-center rounded-full text-pk-12 hover:bg-pk-primary-line/50 focus-visible:outline-2 focus-visible:outline-pk-primary"
          >
            ✕
          </button>
        </span>
      )}
      <span className="ml-auto text-pk-13 font-semibold text-pk-sub">
        {filteredMatches.length}경기
      </span>
    </div>
  );

  const renderList = () => {
    if (!data) {
      return (
        <Card className="text-pk-15 text-pk-sub">
          {loadError ? (
            <div className="flex items-center gap-3">
              <span className="flex-1">{loadError}</span>
              <Button variant="soft" onClick={initialLoad}>
                다시 불러오기
              </Button>
            </div>
          ) : (
            "경기를 불러오는 중…"
          )}
        </Card>
      );
    }
    if (filteredMatches.length === 0) {
      return <Card className="text-pk-15 text-pk-sub">조건에 맞는 경기가 없어요.</Card>;
    }
    return (
      <>
        <MatchList
          matches={visibleMatches}
          players={data.players}
          selectedMatchId={selectedMatch?.id ?? null}
          onSelect={(matchId) => updateRoute({ matchId })}
        />
        {filteredMatches.length > visibleCount && (
          <div className="mt-5 flex justify-center">
            <Button
              variant="soft"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              이전 경기 더 보기
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader title="경기" />
      <div role="tablist" aria-label="경기 화면" className="mb-5 flex gap-1 border-b border-pk-divider">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="-mb-px border-b-2 border-pk-primary px-1 pb-2.5 text-pk-15 font-bold text-pk-ink"
        >
          경기 목록
        </button>
      </div>
      {filterBar}
      <ListWithPanel
        list={renderList()}
        panel={
          selectedMatch && data ? (
            <MatchCorrectionPanel
              key={`${selectedMatch.id}:${toDate(selectedMatch.updatedAt).getTime()}`}
              match={selectedMatch}
              players={data.players}
              sessions={data.sessions}
              onClose={() => updateRoute({ matchId: undefined })}
              onReload={reload}
              onDeleted={handleDeleted}
            />
          ) : null
        }
      />
    </>
  );
};

export default MatchesPage;
