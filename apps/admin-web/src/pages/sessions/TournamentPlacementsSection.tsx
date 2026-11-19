import React, { useMemo, useState } from "react";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import type { MatchSessionDetail } from "@pkpkdupr/shared/session";
import {
  TOURNAMENT_PLACES,
  type TournamentPlace,
  type TournamentPlacement,
} from "@pkpkdupr/shared/tournament";
import { updateTournamentPlacements } from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { InlineError } from "../../components/ui/InlineError";
import { PanelSection } from "../../components/ui/DetailPanel";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { PlayerPicker } from "../../components/ui/PlayerPicker";
import { useToast } from "../../components/ui/Toast";
import { reportMutationError } from "./sessionErrors";

type PlacementRows = Record<TournamentPlace, string[]>;

const toRows = (placements: TournamentPlacement[] | undefined): PlacementRows => {
  const rows: PlacementRows = { 1: [], 2: [], 3: [] };
  for (const placement of placements ?? []) {
    rows[placement.place] = placement.players.map((player) => player.id);
  }
  return rows;
};

const isSameRows = (a: PlacementRows, b: PlacementRows) =>
  TOURNAMENT_PLACES.every((place) => a[place].join(",") === b[place].join(","));

/**
 * 끝난 대회 세션의 최종 순위 칸. 1~3위마다 세션 참여자 중 여러 명을 고르고(한 사람은 한 순위),
 * 저장하면 세 줄을 통째로 바꾼다. 고른 순서가 저장되어 첫 사람이 대표다.
 */
export const TournamentPlacementsSection: React.FC<{
  detail: MatchSessionDetail;
  /** 이름·게스트 여부를 찾을 회원 전체 */
  players: AdminPlayer[];
}> = ({ detail, players }) => {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<PlacementRows>(() => toRows(detail.placements));
  const [rows, setRows] = useState<PlacementRows>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 칩 이름은 회원 목록에서 찾고, 없으면 저장된 순위의 이름을 쓴다
  const lookup = useMemo(() => {
    const map = new Map<string, { username: string; avatarUrl?: string; isGuest?: boolean }>();
    for (const placement of detail.placements ?? []) {
      for (const player of placement.players) map.set(player.id, player);
    }
    for (const player of players) map.set(player.id, player);
    return map;
  }, [detail.placements, players]);

  const candidates = useMemo(() => {
    const participantIds = new Set(detail.participants.map((participant) => participant.id));
    return players.filter((player) => participantIds.has(player.id));
  }, [detail.participants, players]);

  const pickedIds = useMemo(() => TOURNAMENT_PLACES.flatMap((place) => rows[place]), [rows]);
  const dirty = !isSameRows(rows, saved);

  const updateRow = (place: TournamentPlace, playerIds: string[]) => {
    setRows((current) => ({ ...current, [place]: playerIds }));
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateTournamentPlacements(detail.id, {
        placements: TOURNAMENT_PLACES.filter((place) => rows[place].length > 0).map(
          (place) => ({ place, playerIds: rows[place] }),
        ),
      });
      const nextRows = toRows(next.placements);
      setSaved(nextRows);
      setRows(nextRows);
      showToast("최종 순위를 저장했어요");
    } catch (err) {
      reportMutationError(err, setError, showToast);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelSection title="최종 순위">
      <ul className="space-y-3">
        {TOURNAMENT_PLACES.map((place) => {
          const ids = rows[place];
          return (
            <li key={place} className="flex items-start gap-3">
              <span className="w-10 shrink-0 pt-2.5 text-pk-15 font-bold text-pk-ink">
                {place}위
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {ids.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label={`${place}위`}>
                    {ids.map((playerId) => {
                      const player = lookup.get(playerId);
                      const username = player?.username ?? "알 수 없는 회원";
                      return (
                        <li
                          key={playerId}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pk-bg pl-1 pr-1.5 text-pk-13 font-semibold text-pk-ink"
                        >
                          <PlayerAvatar
                            player={{ username, avatarUrl: player?.avatarUrl }}
                            size={24}
                          />
                          <span>{username}</span>
                          {player?.isGuest && <Chip className="h-5 px-2">게스트</Chip>}
                          <button
                            type="button"
                            aria-label={`${place}위에서 ${username} 빼기`}
                            disabled={saving}
                            onClick={() =>
                              updateRow(
                                place,
                                ids.filter((id) => id !== playerId),
                              )
                            }
                            className="flex size-6 items-center justify-center rounded-full text-pk-12 text-pk-muted hover:bg-pk-neutral hover:text-pk-sub focus-visible:outline-2 focus-visible:outline-pk-primary"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!saving && (
                  <PlayerPicker
                    players={candidates}
                    excludeIds={pickedIds}
                    placeholder={`${place}위 아이디 검색`}
                    onSelect={(playerId) => updateRow(place, [...ids, playerId])}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {candidates.length === 0 && (
        <p className="mt-2 text-pk-13 text-pk-muted">
          세션 참여자가 없어 순위를 고를 수 없어요.
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "저장 중…" : "저장"}
        </Button>
        <span className="text-pk-12 text-pk-muted">
          한 순위에 여러 명을 고를 수 있고, 첫 사람이 대표예요.
        </span>
      </div>
      <div className="mt-2">
        <InlineError message={error} />
      </div>
    </PanelSection>
  );
};
