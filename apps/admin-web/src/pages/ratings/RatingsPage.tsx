import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import { fetchAdminPlayers } from "../../api/players";
import { Card } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/InlineError";
import { PageHeader } from "../../components/ui/PageHeader";
import { parseRatingsParams } from "../../lib/adminRoutes";
import { AchievementHoldersCard } from "./AchievementHoldersCard";
import { OfficialDuprCard } from "./OfficialDuprCard";
import { RecalculateCard } from "./RecalculateCard";

const RatingsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { playerId: initialPlayerId } = parseRatingsParams(searchParams);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 평점이 바뀌면 올려서 회원 목록·업적 현황을 다시 읽는다
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let canceled = false;
    fetchAdminPlayers()
      .then((data) => {
        if (canceled) return;
        setPlayers(data);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setLoadError(err instanceof Error ? err.message : "회원 목록을 불러오지 못했어요.");
      });
    return () => {
      canceled = true;
    };
  }, [reloadKey]);

  const eligiblePlayers = useMemo(
    () => players.filter((player) => player.status === "active" && !player.isGuest),
    [players],
  );

  const reload = useCallback(() => setReloadKey((prev) => prev + 1), []);

  return (
    <>
      <PageHeader title="평점" />
      {loadError && (
        <Card className="mb-5">
          <InlineError message={loadError} />
        </Card>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-5">
        <OfficialDuprCard
          players={eligiblePlayers}
          initialPlayerId={initialPlayerId}
          onApplied={reload}
        />
        <div className="space-y-5">
          <RecalculateCard onRecalculated={reload} />
          <AchievementHoldersCard reloadKey={reloadKey} />
        </div>
      </div>
    </>
  );
};

export default RatingsPage;
