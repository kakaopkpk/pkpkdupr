import React, { useEffect, useRef } from "react";
import type { SessionPlayerReport } from "@pkpkdupr/shared/ranking";
import AchievementBadge from "@/components/profile/AchievementBadge";
import {
  hasRatingBeforeAndAfter,
  SessionRankChangePop,
  SessionRankCount,
  SessionRatingCount,
  SessionRatingDeltaCount,
} from "@/components/records/SessionReportParts";
import SkeletonBlock from "@/components/SkeletonBlock";
import { SessionDominatorBadge } from "@/components/ui/Badges";
import { rowPressClassName } from "@/components/ui/Button";
import { COUNT_UP, CountUpRatingDelta } from "@/components/ui/CountUpNumber";
import { RankChange } from "@/components/ui/Delta";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Section, TextLink } from "@/components/ui/Section";
import { StateMessage } from "@/components/ui/StateMessage";
import { cx } from "@/components/ui/cx";
import { useAppNavigation } from "@/context/AppNavigationContext";
import { usePlayOnShow } from "@/hooks/usePlayOnShow";
import { getAchievementDefinition } from "@/lib/achievements";
import { formatKstMonthDay, formatKstShortDate } from "@/lib/format";
import { getObjectParticle } from "@/lib/korean";
import {
  getNewsFeedItemKey,
  type NewsFeedLineInfo,
  type NewsFeedNewMemberItemInfo,
  type NewsFeedSessionItemInfo,
} from "@/lib/newsFeed";
import { formatRating } from "@/utils/dupr";
import type { NewsFeedState } from "@/components/home/useNewsFeed";

// 바닥에 닿기 전 이만큼 남았을 때 다음 페이지를 미리 불러온다
const PREFETCH_MARGIN_PX = 240;
const TAB_SCROLL_AREA_SELECTOR = ".app-tab-panel-scroll-area";

/** 소식 문장 안 아이디·핵심 단어. 검정 굵게만 하고 색은 바꾸지 않는다 */
const Strong: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <b className="font-extrabold">{children}</b>
);

const lineTextClassName = "text-pk-15 text-pk-ink break-keep";

/** 탭 본문 스크롤 영역 바닥에 다가가면 onReach를 부른다 */
const InfiniteScrollTrigger: React.FC<{
  isEnabled: boolean;
  /** 바뀔 때마다 다시 관찰해 화면이 덜 찼으면 이어서 불러오게 한다 */
  loadedCount: number;
  onReach: () => void;
}> = ({ isEnabled, loadedCount, onReach }) => {
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!isEnabled || !target || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      {
        root: target.closest(TAB_SCROLL_AREA_SELECTOR),
        rootMargin: `0px 0px ${PREFETCH_MARGIN_PX}px 0px`,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isEnabled, loadedCount, onReach]);

  return <div ref={targetRef} aria-hidden="true" className="h-px" />;
};

/** 세션 카드 안 소식 줄 하나의 틀: 아바타 36 + 문장, 최소 높이 60, 줄 사이 구분선 */
const FeedLineButton: React.FC<{
  player: SessionPlayerReport["player"];
  onPress: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}> = ({ player, onPress, children, right }) => (
  <button
    type="button"
    onClick={onPress}
    className={cx(
      "flex min-h-[60px] w-full items-center gap-3 py-3 text-left not-last:border-b not-last:border-pk-divider active:opacity-80",
      rowPressClassName,
    )}
  >
    <PlayerAvatar player={player} size={36} />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
    {right}
  </button>
);

const FeedLine: React.FC<{ line: NewsFeedLineInfo }> = ({ line }) => {
  const { openAchievements, openMemberProfile, selectTab } = useAppNavigation();
  const { player } = line;

  if (line.kind === "achievement") {
    const definition = getAchievementDefinition(line.achievementId);
    if (!definition) return null;
    return (
      <FeedLineButton
        player={player}
        onPress={() =>
          openAchievements({
            playerId: player.id,
            focusAchievementId: line.achievementId,
          })
        }
        right={
          // 배지 숫자 꼬리표가 아래로 걸치므로 그만큼 올린다
          <span className="flex shrink-0 pb-1.5">
            <AchievementBadge achievement={definition} earned size={36} />
          </span>
        }
      >
        <span className={lineTextClassName}>
          <Strong>{player.username}</Strong>님이 업적{" "}
          <Strong>{definition.name}</Strong>
          {getObjectParticle(definition.name)} 달성했어요
        </span>
        <span className="text-pk-13 text-pk-sub">{definition.condition}</span>
      </FeedLineButton>
    );
  }

  if (line.kind === "winStreak") {
    return (
      <FeedLineButton player={player} onPress={() => openMemberProfile(player.id)}>
        <span className={lineTextClassName}>
          <Strong>{player.username}</Strong>님이{" "}
          <Strong>{line.winStreak}연승</Strong> 중이에요
        </span>
      </FeedLineButton>
    );
  }

  return (
    <FeedLineButton player={player} onPress={() => selectTab("ranking")}>
      <span className={lineTextClassName}>
        <Strong>{player.username}</Strong>님이 랭킹 <Strong>{line.rank}위</Strong>
        {line.rankChange !== null && line.rankChange > 0 ? (
          <RankChange
            value={line.rankChange}
            className="mr-px ml-1 text-pk-13 font-extrabold"
          />
        ) : null}
        에 올랐어요
      </span>
    </FeedLineButton>
  );
};

/** 내 복식 평점·랭킹 두 칸. "–"·하락·변동 없음 표시는 일정 탭 끝난 세션 카드의 내 칸과 같다 */
const FeedMineStats: React.FC<{ mine: SessionPlayerReport }> = ({ mine }) => (
  <div className="flex items-end justify-between gap-3 pt-3.5 pb-4">
    <div className="flex min-w-0 flex-col">
      <span className="text-pk-12 text-pk-sub">내 복식 평점</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-pk-22 font-extrabold text-pk-ink tabular-nums">
          <SessionRatingCount report={mine} />
        </span>
        {/* 평점이 없으면 변화도 없으므로 "–" 하나만 보인다 */}
        {mine.ratingAfter !== null ? (
          <SessionRatingDeltaCount report={mine} />
        ) : null}
      </span>
    </div>
    <div className="flex min-w-0 flex-col items-end text-right">
      <span className="text-pk-12 text-pk-sub">랭킹</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-pk-22 font-extrabold text-pk-ink tabular-nums">
          <SessionRankCount report={mine} />
        </span>
        <SessionRankChangePop
          report={mine}
          className="text-pk-15 font-extrabold"
        />
      </span>
    </div>
  </div>
);

/**
 * 세션 지배자 줄: 불꽃 후광 아바타 48, 앰버 알약, 아이디, 이전 → 이후 평점, 오른쪽 끝 상승폭.
 * 보일 때마다 왕관 까딱임·칩 흰 빛·상승폭 카운트업을 한 번 재생한다(TopRiserCard와 같은 연출)
 */
const FeedTopRiser: React.FC<{ report: SessionPlayerReport }> = ({ report }) => {
  const { openMemberProfile } = useAppNavigation();
  const { isPlaying, finish } = usePlayOnShow();

  return (
    <button
      type="button"
      onClick={() => openMemberProfile(report.player.id)}
      className={cx(
        "flex w-full items-center gap-4 py-3.5 text-left active:opacity-80",
        rowPressClassName,
      )}
    >
      <span className="pk-flame-aura shrink-0">
        <PlayerAvatar player={report.player} size={48} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span
          className="flex"
          onAnimationEnd={(event) => {
            // 칩 흰 빛이 가장 늦게 끝나는 CSS 연출이다
            if (event.animationName === "pk-sheen") finish();
          }}
        >
          <SessionDominatorBadge isPlaying={isPlaying} />
        </span>
        <span className="max-w-full truncate text-pk-22 font-extrabold text-pk-ink">
          {report.player.username}
        </span>
        <span className="text-pk-13 text-pk-sub tabular-nums">
          {hasRatingBeforeAndAfter(report)
            ? `${formatRating(report.ratingBefore)} → `
            : null}
          {formatRating(report.ratingAfter)}
        </span>
      </span>
      <CountUpRatingDelta
        value={report.ratingDelta}
        className="shrink-0 text-pk-26 font-extrabold"
        {...COUNT_UP}
      />
    </button>
  );
};

/** 세션 하나의 소식 카드: 머리, 내 칸, 세션 지배자, 소식 줄. 머리 다음 묶음부터 사이에 구분선을 둔다 */
const NewsSessionCard: React.FC<{ item: NewsFeedSessionItemInfo }> = ({
  item,
}) => {
  const { openSessionReport } = useAppNavigation();
  const { session, mine, topRiser } = item;
  // 정의를 찾지 못한 업적 줄은 그리지 않으므로 줄 묶음 표시 여부도 그 기준으로 정한다
  const lines = item.lines.filter(
    (line) =>
      line.kind !== "achievement" ||
      getAchievementDefinition(line.achievementId) !== null,
  );
  const blocks = [
    mine ? <FeedMineStats key="mine" mine={mine} /> : null,
    topRiser ? <FeedTopRiser key="riser" report={topRiser} /> : null,
    lines.length > 0 ? (
      <div key="lines" className="flex flex-col">
        {lines.map((line, index) => (
          <FeedLine key={`${line.kind}:${line.player.id}:${index}`} line={line} />
        ))}
      </div>
    ) : null,
  ].filter((block): block is React.ReactElement => block !== null);

  return (
    <article
      className={cx(
        "flex flex-col rounded-pk-lg bg-white px-5 pt-[18px]",
        blocks.length > 0 ? "pb-1.5" : "pb-[18px]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-pk-17 font-extrabold text-pk-ink">
            {session.name}
          </span>
          <span className="shrink-0 text-pk-13 text-pk-muted">
            {formatKstShortDate(session.date)}
          </span>
        </span>
        {/* 링크 터치 영역(44px)이 머리 높이를 늘리지 않게 위아래로 겹친다 */}
        <span className="-my-3 flex shrink-0">
          <TextLink onPress={() => openSessionReport(session.id)} chevron>
            리포트
          </TextLink>
        </span>
      </div>
      {blocks.map((block, index) => (
        <div
          key={block.key}
          className={index > 0 ? "border-t border-pk-divider" : undefined}
        >
          {block}
        </div>
      ))}
    </article>
  );
};

/** 새 회원 얇은 카드 */
const NewMemberCard: React.FC<{ item: NewsFeedNewMemberItemInfo }> = ({
  item,
}) => {
  const { openMemberProfile } = useAppNavigation();
  return (
    <button
      type="button"
      onClick={() => openMemberProfile(item.player.id)}
      className={cx(
        "flex min-h-[60px] w-full items-center gap-3 rounded-pk-lg bg-white px-5 py-3 text-left active:bg-pk-primary-soft/60",
        rowPressClassName,
      )}
    >
      <PlayerAvatar player={item.player} size={32} />
      <span className={cx("min-w-0 flex-1", lineTextClassName)}>
        <Strong>{item.player.username}</Strong>님이 새로 가입했어요
      </span>
      <span className="shrink-0 text-pk-13 text-pk-muted">
        {formatKstMonthDay(item.joinedAt)}
      </span>
    </button>
  );
};

const NewsFeedSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" className="flex flex-col gap-2.5 pt-2.5">
    <span className="sr-only">소식을 불러오는 중</span>
    <SkeletonBlock className="h-3.5 w-1/5 rounded-full" />
    <div className="flex flex-col gap-3 rounded-pk-lg bg-white px-5 py-[18px]">
      <SkeletonBlock className="h-[18px] w-2/5 rounded-pk-sm" />
      <SkeletonBlock className="h-12 w-full rounded-pk-sm" />
      <SkeletonBlock className="h-4 w-4/5 rounded-pk-sm" />
      <SkeletonBlock className="h-4 w-3/5 rounded-pk-sm" />
    </div>
  </div>
);

/**
 * 진행 중 세션이 없을 때 홈의 "소식" 피드. 최신 세션 카드부터, 새 회원 카드는 API 순서대로 그 사이에 끼운다.
 * 목록 끝에 다가가면 이전 세션을 이어 붙이고, 항목이 하나도 없으면 섹션 전체를 그리지 않는다
 */
const NewsFeed: React.FC<{ feed: NewsFeedState }> = ({ feed }) => {
  const { items, status, error, hasMore, isLoadingMore, hasMoreError } = feed;

  if (status === "loading") return <NewsFeedSkeleton />;
  if (status === "error") {
    return (
      <Section title="소식">
        <StateMessage
          kind="error"
          message={error ?? "소식을 불러오지 못했어요"}
          onRetry={() => void feed.reload()}
        />
      </Section>
    );
  }
  if (items.length === 0) return null;

  return (
    <Section title="소식">
      <div className="flex flex-col gap-5">
        {items.map((item) =>
          item.kind === "session" ? (
            <NewsSessionCard key={getNewsFeedItemKey(item)} item={item} />
          ) : (
            <NewMemberCard key={getNewsFeedItemKey(item)} item={item} />
          ),
        )}
      </div>
      {hasMoreError ? (
        <div className="flex flex-col items-center py-2">
          <p className="text-pk-13 text-pk-muted">이전 소식을 불러오지 못했어요</p>
          <TextLink onPress={feed.loadMore}>다시 시도</TextLink>
        </div>
      ) : null}
      {hasMore && !hasMoreError ? (
        <>
          <InfiniteScrollTrigger
            isEnabled={!isLoadingMore}
            loadedCount={items.length}
            onReach={feed.loadMore}
          />
          {isLoadingMore ? (
            <SkeletonBlock className="h-[120px] rounded-pk-lg" />
          ) : null}
        </>
      ) : null}
    </Section>
  );
};

export default NewsFeed;
