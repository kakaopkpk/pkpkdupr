import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import SkeletonBlock from "@/components/SkeletonBlock";
import AvatarZoomViewer from "@/components/profile/AvatarZoomViewer";
import { WinLossCount } from "@/components/profile/ProfileStatTile";
import { COUNT_UP, CountUpNumber } from "@/components/ui/CountUpNumber";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { StatusMessageChip } from "@/components/ui/StatusMessageChip";
import { cx } from "@/components/ui/cx";
import {
  type TabKey,
  useTabNavigation,
} from "@/context/TabNavigationContext";
import { useLayerDepth } from "@/hooks/useLayerDepth";
import { resolveAssetUrl } from "@/lib/api";
import type { PlayerProfileSummaryInfo } from "@/lib/playerProfile";

/** 복식·단식을 합친 승패 */
export const getTotalMatchStats = (
  matchStats: PlayerProfileSummaryInfo["matchStats"],
): { wins: number; losses: number } =>
  Object.values(matchStats).reduce(
    (sum, stats) => ({
      wins: sum.wins + stats.matchWins,
      losses: sum.losses + stats.matchLosses,
    }),
    { wins: 0, losses: 0 },
  );

export interface ProfileHeaderProps {
  /** 아직 모르면 null(아바타 자리를 깜빡이는 원으로 둔다) */
  player: { id: string; username: string; avatarUrl?: string | null } | null;
  statusMessage?: string | null;
  statusMessageBackgroundColor?: string | null;
  /** 프로필 요약의 matchStats. 없으면 불러오는 중(스켈레톤)이거나 숨김(hideStats)이다 */
  matchStats: PlayerProfileSummaryInfo["matchStats"] | null | undefined;
  /** matchStats가 없을 때 스켈레톤 대신 승패 줄 자리를 비운다. 요약을 불러오지 못했거나 비활성 회원일 때 */
  hideStats?: boolean;
  /** 이름 제목 태그. 화면 머리에 다른 h1이 있으면 h2를 쓴다 */
  headingAs?: "h1" | "h2";
  /** 사진 확대 보기를 뒤로가기에 묶을 탭 */
  tabKey: TabKey;
  /** 오른쪽 슬롯(예: 나 탭 설정 버튼) */
  right?: React.ReactNode;
  /** 바깥 여백은 화면마다 정한다 */
  className?: string;
}

/**
 * 나 탭·회원 프로필 공용 머리. 흰 카드 없이 바탕 위에 아바타 56 · 이름 22/800 ·
 * "N경기 · N승 N패"(복식+단식 합) 줄과 오른쪽 슬롯을 한 행에 두고,
 * 상태메시지는 그 행 아래 작은 칩으로 둔다. 상태메시지 유무와 상관없이 행 높이가 같다.
 * 사진을 불러온 아바타는 누르면 사진 확대 보기(AvatarZoomViewer)를 연다.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  player,
  statusMessage,
  statusMessageBackgroundColor,
  matchStats,
  hideStats = false,
  headingAs: Heading = "h1",
  tabKey,
  right,
  className,
}) => {
  const totalStats = matchStats ? getTotalMatchStats(matchStats) : null;
  const { closeDepth } = useTabNavigation();
  const zoomDepthId = `avatar-zoom-${useId()}`;
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const [loadedAvatarUrl, setLoadedAvatarUrl] = useState<string | null>(null);
  const [isZoomRequested, setIsZoomRequested] = useState(false);
  /** 확대 보기가 화면에 있는 동안(닫힘 전환 포함) 원래 아바타를 숨긴다 */
  const [isZoomVisible, setIsZoomVisible] = useState(false);
  const shouldRestoreFocusRef = useRef(false);

  const avatarUrl = resolveAssetUrl(player?.avatarUrl);
  const canZoom = !!player && !!avatarUrl && loadedAvatarUrl === avatarUrl;

  const closeZoom = useCallback(() => setIsZoomRequested(false), []);
  const isZoomOpen = useLayerDepth({
    isOpen: isZoomRequested,
    tabKey,
    depthId: zoomDepthId,
    kind: "dialog",
    onClose: closeZoom,
  });

  const openZoom = () => {
    if (!canZoom) return;
    setIsZoomVisible(true);
    setIsZoomRequested(true);
  };

  const requestCloseZoom = useCallback(() => {
    if (!closeDepth(tabKey, zoomDepthId)) closeZoom();
  }, [closeDepth, closeZoom, tabKey, zoomDepthId]);

  const handleZoomExited = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setIsZoomVisible(false);
  }, []);

  // 숨겨 둔(invisible) 아바타는 포커스를 받지 못하므로 다시 보인 뒤에 포커스를 돌려준다
  useEffect(() => {
    if (isZoomVisible || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    avatarButtonRef.current?.focus({ preventScroll: true });
  }, [isZoomVisible]);

  return (
    <header className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-3">
        {player ? (
          <button
            ref={avatarButtonRef}
            type="button"
            disabled={!canZoom}
            aria-label={canZoom ? `${player.username} 프로필 사진 크게 보기` : undefined}
            aria-hidden={canZoom ? undefined : true}
            tabIndex={canZoom ? undefined : -1}
            onClick={openZoom}
            className={cx(
              "shrink-0 rounded-full transition-transform duration-150 ease-pk-move enabled:active:scale-[0.92] motion-reduce:transition-none",
              isZoomVisible && "invisible",
            )}
          >
            <PlayerAvatar
              player={player}
              size={56}
              onImageLoad={setLoadedAvatarUrl}
            />
          </button>
        ) : (
          <span className="size-14 shrink-0 animate-pulse rounded-full bg-pk-neutral" />
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <Heading className="max-w-full truncate text-pk-22 leading-[1.25] font-extrabold tracking-[-0.02em] text-pk-ink">
            {player?.username ?? ""}
          </Heading>
          {totalStats ? (
            <span className="text-pk-13 text-pk-sub tabular-nums">
              <CountUpNumber
                value={totalStats.wins + totalStats.losses}
                {...COUNT_UP}
              />
              경기 ·{" "}
              <WinLossCount wins={totalStats.wins} losses={totalStats.losses} />
            </span>
          ) : hideStats ? null : (
            <SkeletonBlock className="h-4 w-32" />
          )}
        </div>
        {right}
      </div>
      {statusMessage ? (
        <div>
          <StatusMessageChip
            message={statusMessage}
            color={statusMessageBackgroundColor}
          />
        </div>
      ) : null}
      {player && avatarUrl && isZoomVisible ? (
        <AvatarZoomViewer
          isOpen={isZoomOpen && isZoomRequested}
          imageUrl={avatarUrl}
          username={player.username}
          originRef={avatarButtonRef}
          onRequestClose={requestCloseZoom}
          onExited={handleZoomExited}
        />
      ) : null}
    </header>
  );
};

export default ProfileHeader;
