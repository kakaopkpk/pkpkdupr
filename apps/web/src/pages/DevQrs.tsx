import React, { useEffect, useMemo, useState } from "react";
import QrCode from "react-qr-code";
import type {
  DevPlayerQrToken,
  DevPlayerQrTokenListResponse,
} from "@pkpkdupr/shared/qr";
import type { Player } from "@pkpkdupr/shared/player";
import CreateMatchTeamGrid from "@/components/CreateMatchTeamGrid";
import type { MatchTeams } from "@/components/CreateMatchDrawerBody.utils";
import UserChip from "@/components/UserChip";
import { apiFetch } from "@/lib/api";

const devUserChipPreviewPlayers = {
  me: {
    username: "김피클",
    gender: "M",
  },
  longName: {
    username: "피클볼플레이어이름이긴사용자",
    gender: "F",
  },
} satisfies Record<string, Pick<Player, "username" | "avatarUrl" | "gender">>;

const devCreateMatchPreviewTeams = [
  [
    {
      id: "dev-current-player",
      ...devUserChipPreviewPlayers.me,
    },
  ],
  [
    {
      id: "dev-long-name-player",
      ...devUserChipPreviewPlayers.longName,
    },
  ],
] satisfies MatchTeams;

const noop = () => {};

const getGenderLabel = (gender: DevPlayerQrToken["player"]["gender"]) =>
  gender === "M" ? "남자" : "여자";

const getGenderClassName = (gender: DevPlayerQrToken["player"]["gender"]) =>
  gender === "M"
    ? "bg-[#409eff]/10 text-[#409eff]"
    : "bg-[#f8626c]/10 text-[#f8626c]";

const DevQrCard: React.FC<{ token: DevPlayerQrToken }> = ({ token }) => (
  <div className="rounded-3xl border border-border bg-white p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-pkpk-sub-font">
          {token.player.username}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-pkpk-sub-font">
          {token.player.id}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${getGenderClassName(
          token.player.gender,
        )}`}
      >
        {getGenderLabel(token.player.gender)}
      </span>
    </div>

    <div className="mt-3 flex justify-center rounded-2xl bg-white p-3 ring-1 ring-border">
      <QrCode
        value={token.payload}
        size={132}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  </div>
);

const DevQrSection: React.FC<{
  title: string;
  tokens: DevPlayerQrToken[];
}> = ({ title, tokens }) => (
  <section>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-bold text-pkpk-sub-font">{title}</h2>
      <span className="text-xs font-semibold text-pkpk-sub-font">
        {tokens.length}명
      </span>
    </div>
    <div className="grid grid-cols-2 gap-12 md:grid-cols-4 xl:gap-16">
      {tokens.map((token) => (
        <DevQrCard key={token.player.id} token={token} />
      ))}
    </div>
  </section>
);

const DevUserChipPreview: React.FC = () => (
  <section className="mt-6 rounded-3xl border border-border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-bold text-pkpk-sub-font">
          UserChip Preview
        </h2>
        <p className="mt-1 text-sm text-pkpk-sub-font">
          크기, 좌우 배치, 긴 이름과 ‘나’ 배지 위치를 비교합니다.
        </p>
      </div>
      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
        Dev Only
      </span>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-pkpk-bg p-3">
        <p className="text-xs font-semibold text-pkpk-sub-font">
          default · 왼쪽
        </p>
        <p className="mt-0.5 text-[11px] text-pkpk-sub-font">
          높이 24px · 너비 72–120px · ‘나’ x축 40% / y축 -20.5%
        </p>
        <div className="mt-2">
          <UserChip player={devUserChipPreviewPlayers.me} isMe />
        </div>
      </div>
      <div className="rounded-2xl bg-pkpk-bg p-3">
        <p className="text-xs font-semibold text-pkpk-sub-font">
          default · 오른쪽
        </p>
        <p className="mt-0.5 text-[11px] text-pkpk-sub-font">
          높이 24px · 너비 72–120px · ‘나’ x축 40% / y축 -20.5%
        </p>
        <div className="mt-2 flex justify-end">
          <UserChip
            player={devUserChipPreviewPlayers.longName}
            isMe
            isMirrored
          />
        </div>
      </div>
      <div className="rounded-2xl bg-pkpk-bg p-3">
        <p className="text-xs font-semibold text-pkpk-sub-font">
          match · 왼쪽
        </p>
        <p className="mt-0.5 text-[11px] text-pkpk-sub-font">
          높이 32–44px · 너비 96–160px · ‘나’ 120%
        </p>
        <div className="mt-2">
          <UserChip
            player={devUserChipPreviewPlayers.me}
            isMe
            size="match"
          />
        </div>
      </div>
      <div className="rounded-2xl bg-pkpk-bg p-3">
        <p className="text-xs font-semibold text-pkpk-sub-font">
          match · 오른쪽
        </p>
        <p className="mt-0.5 text-[11px] text-pkpk-sub-font">
          높이 32–44px · 너비 96–160px · ‘나’ 120%
        </p>
        <div className="mt-2 flex justify-end">
          <UserChip
            player={devUserChipPreviewPlayers.longName}
            isMe
            size="match"
            isMirrored
          />
        </div>
      </div>
      <div className="rounded-2xl bg-pkpk-bg p-3 sm:col-span-2">
        <p className="text-xs font-semibold text-pkpk-sub-font">
          매치 생성 · default · ‘나’ 배지 x축 40% / y축 -20.5%
        </p>
        <p className="mt-0.5 text-[11px] text-pkpk-sub-font">
          실제 CreateMatchTeamGrid · 높이 24px · 너비 72–120px
        </p>
        <div className="mt-2 flex justify-center">
          <div className="w-[calc(100%+38px)] max-w-[480px] rounded-t-3xl bg-white px-3 pb-4">
            <CreateMatchTeamGrid
              previewTeams={devCreateMatchPreviewTeams}
              teams={devCreateMatchPreviewTeams}
              selectedMatchType={null}
              selectedSwapMemberId={null}
              currentPlayerMemberId="dev-current-player"
              interactive
              onRemoveMember={noop}
              onPressMember={noop}
            />
          </div>
        </div>
      </div>
    </div>
  </section>
);

const DevQrs: React.FC = () => {
  const [tokens, setTokens] = useState<DevPlayerQrToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadDevQrTokens = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const res = await apiFetch("/api/dev/player-qr-tokens");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Dev QR 목록을 불러오지 못했습니다.",
          );
        }

        const data = (await res.json()) as DevPlayerQrTokenListResponse;
        if (!isCancelled) {
          setTokens(data.players);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Dev QR 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDevQrTokens();

    return () => {
      isCancelled = true;
    };
  }, []);

  const menTokens = useMemo(
    () => tokens.filter((token) => token.player.gender === "M").slice(0, 4),
    [tokens],
  );
  const womenTokens = useMemo(
    () => tokens.filter((token) => token.player.gender === "F").slice(0, 4),
    [tokens],
  );

  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-amber-50 px-6 pt-6 pb-[var(--safe-bottom)] text-center">
        <p className="text-sm font-semibold text-pkpk-sub-font">
          Dev QR 페이지는 개발 환경에서만 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-amber-50 px-3 pt-6 pb-[var(--safe-bottom)]">
      <div className="mx-auto w-full max-w-7xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-pkpk-sub-font">
            Dev Only
          </p>
          <h1 className="mt-1 text-2xl font-bold text-pkpk-sub-font">
            Permanent Player QR
          </h1>
          <p className="mt-2 text-sm text-pkpk-sub-font">
            매치 멤버 추가 테스트용 영구 QR입니다.
          </p>
        </header>

        <DevUserChipPreview />

        {isLoading ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-center text-sm text-pkpk-sub-font">
            Dev QR 목록을 불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl bg-white p-6 text-center text-sm font-semibold text-error">
            {error}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            <DevQrSection title="남자" tokens={menTokens} />
            <DevQrSection title="여자" tokens={womenTokens} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DevQrs;
