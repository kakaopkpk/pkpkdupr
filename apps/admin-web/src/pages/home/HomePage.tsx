import React from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  AdminMatchDeletionLog,
  AdminMatchEditLog,
} from "@pkpkdupr/shared/match";
import type { AdminPlayer } from "@pkpkdupr/shared/player";
import {
  IN_PROGRESS_MATCH_TIMEOUT_MS,
  type AdminRegularSessionSkip,
  type MatchSessionDetail,
} from "@pkpkdupr/shared/session";
import {
  fetchAdminMatches,
  fetchMatchDeletionLogs,
  fetchMatchEditLogs,
} from "../../api/matches";
import { fetchAdminPlayers } from "../../api/players";
import {
  fetchRegularSessionSkips,
  fetchTodaySessions,
  fetchUpcomingSessions,
} from "../../api/sessions";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Chip } from "../../components/ui/Chip";
import { PageHeader } from "../../components/ui/PageHeader";
import { cx } from "../../components/ui/cx";
import {
  matchesPath,
  membersPath,
  sessionsPath,
} from "../../lib/adminRoutes";
import { formatKstDateWithWeekday } from "../../lib/format";
import {
  RECENT_NOTICE_DAYS,
  countMemberEditedMatches,
  dateKeyBlock,
  formatDateKeyShort,
  formatSessionTimePlace,
  formatSkip,
  sessionMonth,
  summarizeMatches,
  summarizeMemberDeletions,
  summarizePlayers,
  upcomingSkips,
} from "./homeSummary";
import { useLoader, type LoadState } from "./useLoader";
import { SESSION_KIND_LABELS } from "../sessions/sessionKind";

const UPCOMING_SESSION_LIMIT = 3;
const IN_PROGRESS_TIMEOUT_HOURS = IN_PROGRESS_MATCH_TIMEOUT_MS / (60 * 60 * 1000);

type NoticeData = [
  AdminMatchDeletionLog[],
  AdminMatchEditLog[],
  AdminRegularSessionSkip[],
];

const loadNotices = (): Promise<NoticeData> =>
  Promise.all([
    fetchMatchDeletionLogs(),
    fetchMatchEditLogs(),
    fetchRegularSessionSkips(),
  ]);

const Placeholder: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx("h-4 animate-pulse rounded-full bg-pk-divider", className)} />
);

const LoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="flex items-center gap-3 text-pk-13 text-pk-sub">
    <span>불러오지 못했어요</span>
    <Button variant="soft" size="sm" onClick={onRetry}>
      다시 시도
    </Button>
  </div>
);

/** 로딩이면 자리표시, 실패면 다시 시도, 성공이면 children(data) */
function Loaded<T>({
  state,
  onRetry,
  placeholder,
  children,
}: {
  state: LoadState<T>;
  onRetry: () => void;
  placeholder: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === "loading") return <>{placeholder}</>;
  if (state.status === "error") return <LoadError onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}

const TextLink: React.FC<{ to: string; children: React.ReactNode }> = ({
  to,
  children,
}) => (
  <Link
    to={to}
    className="shrink-0 whitespace-nowrap text-pk-13 font-bold text-pk-primary hover:text-pk-deep"
  >
    {children}
  </Link>
);

const CardTitle: React.FC<{
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, badge, action }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <h2 className="text-pk-17 font-bold text-pk-ink">{title}</h2>
      {badge}
    </div>
    {action}
  </div>
);

interface TileContent {
  value: string;
  note: string;
}

function StatTile<T>({
  label,
  state,
  onRetry,
  render,
}: {
  label: string;
  state: LoadState<T>;
  onRetry: () => void;
  render: (data: T) => TileContent;
}) {
  return (
    <Card className="flex min-h-[132px] flex-col gap-2">
      <span className="text-pk-13 text-pk-sub">{label}</span>
      <Loaded
        state={state}
        onRetry={onRetry}
        placeholder={
          <>
            <Placeholder className="h-8 w-16" />
            <Placeholder className="w-32" />
          </>
        }
      >
        {(data) => {
          const { value, note } = render(data);
          return (
            <>
              <span className="font-num text-[32px] leading-none font-bold text-pk-ink">
                {value}
              </span>
              <span className="min-h-[1lh] text-pk-13 text-pk-sub">{note}</span>
            </>
          );
        }}
      </Loaded>
    </Card>
  );
}

const ListPlaceholder: React.FC<{ rows: number }> = ({ rows }) => (
  <div className="flex flex-col gap-4">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex flex-col gap-2">
        <Placeholder className="w-1/3" />
        <Placeholder className="w-2/3" />
      </div>
    ))}
  </div>
);

const Row: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <li
    className={cx(
      "flex items-center gap-4 border-pk-divider py-3 first:pt-0 last:pb-0 not-last:border-b",
      className,
    )}
  >
    {children}
  </li>
);

const EmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-pk-15 text-pk-sub">{children}</p>
);

const nextSessionTile = (sessions: MatchSessionDetail[]): TileContent => {
  const next = sessions[0];
  if (!next) return { value: "–", note: "예정된 세션 없음" };
  const date = formatDateKeyShort(next.dateKey);
  return {
    value: next.startTime ? `${date} ${next.startTime}` : date,
    note: `${next.name} · 참여 ${next.participants.length}명`,
  };
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const today = useLoader(fetchTodaySessions);
  const players = useLoader(fetchAdminPlayers);
  const matches = useLoader(fetchAdminMatches);
  const upcoming = useLoader(fetchUpcomingSessions);
  const notices = useLoader(loadNotices);

  const todayLabel = (() => {
    if (today.state.status !== "success") return null;
    const [first, ...rest] = today.state.data.sessions;
    if (!first) return "오늘 세션 없음";
    const label = first.startTime
      ? `오늘 ${first.name} ${first.startTime}`
      : `오늘 ${first.name}`;
    return rest.length > 0 ? `${label} 외 ${rest.length}개` : label;
  })();
  const dateLabel = formatKstDateWithWeekday(new Date());

  return (
    <>
      <PageHeader
        title="홈"
        subtitle={todayLabel ? `${dateLabel} · ${todayLabel}` : dateLabel}
        actions={
          <Button onClick={() => navigate(membersPath({ add: true }))}>
            + 회원 추가
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        <section className="grid grid-cols-4 gap-5" aria-label="요약">
          <StatTile
            label="활성 정회원"
            state={players.state}
            onRetry={players.reload}
            render={(data) => {
              const summary = summarizePlayers(data);
              return {
                value: String(summary.activeMemberCount),
                note: `게스트 ${summary.activeGuests.length}명 별도`,
              };
            }}
          />
          <StatTile
            label="이번 주 경기"
            state={matches.state}
            onRetry={matches.reload}
            render={(data) => {
              const summary = summarizeMatches(data);
              return {
                value: String(summary.weekCompletedCount),
                note:
                  summary.weekRatingExcludedCount > 0
                    ? `평점 미반영 ${summary.weekRatingExcludedCount}경기 포함`
                    : "",
              };
            }}
          />
          <StatTile
            label="진행 중 경기"
            state={matches.state}
            onRetry={matches.reload}
            render={(data) => ({
              value: String(summarizeMatches(data).inProgressCount),
              note: `점수 없이 ${IN_PROGRESS_TIMEOUT_HOURS}시간 지나면 자동 정리`,
            })}
          />
          <StatTile
            label="다음 세션"
            state={upcoming.state}
            onRetry={upcoming.reload}
            render={(data) => nextSessionTile(data.sessions)}
          />
        </section>

        <div className="grid grid-cols-2 items-start gap-5">
          <div className="flex flex-col gap-5">
            <TodoCard state={players.state} onRetry={players.reload} />
            <NoticeCard state={notices.state} onRetry={notices.reload} />
          </div>
          <UpcomingSessionsCard
            state={upcoming.state}
            onRetry={upcoming.reload}
          />
        </div>
      </div>
    </>
  );
};

const TodoCard: React.FC<{
  state: LoadState<AdminPlayer[]>;
  onRetry: () => void;
}> = ({ state, onRetry }) => {
  const items: Array<{
    key: string;
    title: string;
    description: string;
    action: React.ReactNode;
  }> = [];
  if (state.status === "success") {
    const { activeGuests, firstLoginMembers } = summarizePlayers(state.data);
    if (activeGuests.length > 0) {
      items.push({
        key: "guests",
        title: `게스트 ${activeGuests.length}명 · 정회원 승급 검토`,
        description: `${activeGuests
          .map((guest) => `${guest.username} ${guest.matchCount}경기`)
          .join(" · ")} (모두 평점 미반영)`,
        action: (
          <TodoButton to={membersPath({ kind: "guest" })}>게스트 보기</TodoButton>
        ),
      });
    }
    if (firstLoginMembers.length > 0) {
      items.push({
        key: "firstLogin",
        title: `첫 비밀번호를 아직 안 바꾼 회원 ${firstLoginMembers.length}명`,
        description: `${firstLoginMembers
          .map((member) => member.username)
          .join(" · ")} — 비밀번호를 잃어버렸다면 초기화해서 임시 비밀번호를 다시 알려 줘요`,
        action: (
          <TodoButton to={membersPath({ firstLogin: true })}>회원 보기</TodoButton>
        ),
      });
    }
  }

  return (
    <Card>
      <CardTitle
        title="처리할 일"
        badge={
          state.status === "success" && items.length > 0 ? (
            <Chip>{items.length}</Chip>
          ) : undefined
        }
      />
      <Loaded state={state} onRetry={onRetry} placeholder={<ListPlaceholder rows={2} />}>
        {() =>
          items.length === 0 ? (
            <EmptyText>처리할 일이 없어요</EmptyText>
          ) : (
            <ul>
              {items.map((item) => (
                <Row key={item.key}>
                  <div className="min-w-0 flex-1">
                    <p className="text-pk-15 font-semibold text-pk-ink">
                      {item.title}
                    </p>
                    <p className="mt-1 text-pk-13 text-pk-sub">
                      {item.description}
                    </p>
                  </div>
                  {item.action}
                </Row>
              ))}
            </ul>
          )
        }
      </Loaded>
    </Card>
  );
};

const TodoButton: React.FC<{ to: string; children: React.ReactNode }> = ({
  to,
  children,
}) => {
  const navigate = useNavigate();
  return (
    <Button variant="soft" size="sm" onClick={() => navigate(to)}>
      {children}
    </Button>
  );
};

const UpcomingSessionsCard: React.FC<{
  state: LoadState<{ sessions: MatchSessionDetail[] }>;
  onRetry: () => void;
}> = ({ state, onRetry }) => (
  <Card>
    <CardTitle
      title="다가오는 세션"
      action={<TextLink to={sessionsPath()}>전체 보기 ›</TextLink>}
    />
    <Loaded state={state} onRetry={onRetry} placeholder={<ListPlaceholder rows={3} />}>
      {(data) => {
        const sessions = data.sessions.slice(0, UPCOMING_SESSION_LIMIT);
        if (sessions.length === 0) {
          return <EmptyText>예정된 세션이 없어요</EmptyText>;
        }
        return (
          <ul>
            {sessions.map((session) => {
              const block = dateKeyBlock(session.dateKey);
              return (
                <li
                  key={session.id}
                  className="border-pk-divider not-last:border-b"
                >
                  <Link
                    to={sessionsPath({
                      sessionId: session.id,
                      month: sessionMonth(session),
                    })}
                    className="-mx-2 flex items-center gap-4 rounded-pk-sm px-2 py-3 hover:bg-pk-bg"
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center text-pk-sub">
                      <span className="text-pk-12">{block.month}</span>
                      <span className="font-num text-[28px] leading-none font-bold text-pk-ink">
                        {block.day}
                      </span>
                      <span className="text-pk-12">{block.weekday}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-pk-15 font-semibold text-pk-ink">
                          {session.name}
                        </span>
                        <Chip>{SESSION_KIND_LABELS[session.kind]}</Chip>
                      </div>
                      <p className="mt-1 truncate text-pk-13 text-pk-sub">
                        {formatSessionTimePlace(session)}
                      </p>
                    </div>
                    <span className="shrink-0 text-pk-15 tabular-nums text-pk-sub">
                      {session.participants.length}명
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      }}
    </Loaded>
  </Card>
);

const NoticeCard: React.FC<{
  state: LoadState<NoticeData>;
  onRetry: () => void;
}> = ({ state, onRetry }) => (
  <Card>
    <CardTitle title="알아 둘 것" />
    <Loaded state={state} onRetry={onRetry} placeholder={<ListPlaceholder rows={2} />}>
      {([deletionLogs, editLogs, skips]) => {
        const deletions = summarizeMemberDeletions(deletionLogs);
        const editedCount = countMemberEditedMatches(editLogs);
        const restDays = upcomingSkips(skips);
        if (deletions.count === 0 && editedCount === 0 && restDays.length === 0) {
          return <EmptyText>알아 둘 것이 없어요</EmptyText>;
        }
        return (
          <ul>
            {deletions.count > 0 && (
              <Row>
                <Chip>경기 삭제</Chip>
                <p className="min-w-0 flex-1 text-pk-13 text-pk-ink">
                  최근 {RECENT_NOTICE_DAYS}일 회원이 지운 경기 {deletions.count}건
                  {deletions.hasCompleted &&
                    " · 완료 경기라 평점이 다시 계산됐어요"}
                </p>
                <TextLink to={matchesPath({ tab: "deleted" })}>삭제된 경기 ›</TextLink>
              </Row>
            )}
            {editedCount > 0 && (
              <Row>
                <Chip>경기 수정</Chip>
                <p className="min-w-0 flex-1 text-pk-13 text-pk-ink">
                  최근 {RECENT_NOTICE_DAYS}일 회원이 고친 경기 {editedCount}건
                </p>
                <TextLink to={matchesPath({ tab: "edited" })}>수정된 경기 ›</TextLink>
              </Row>
            )}
            {restDays.length > 0 && (
              <Row>
                <Chip>쉬는 날</Chip>
                <p className="min-w-0 flex-1 text-pk-13 text-pk-ink">
                  {restDays.map(formatSkip).join(" · ")} · 그날은 정기 세션을 만들지
                  않아요
                </p>
                <TextLink to={sessionsPath()}>세션 달력 ›</TextLink>
              </Row>
            )}
          </ul>
        );
      }}
    </Loaded>
  </Card>
);

export default HomePage;
