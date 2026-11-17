import React from "react";
import type { ManagedMatchSession } from "@pkpkdupr/shared/match";
import { formatSessionTimeRange } from "@pkpkdupr/shared/session";
import { Chip } from "../../components/ui/Chip";
import { formatKstDateWithWeekday } from "../../lib/format";

/** 패널 머리 제목: 이름 + 정기/회원 세션 칩 */
export const SessionPanelTitle: React.FC<{
  session: Pick<ManagedMatchSession, "name" | "kind">;
}> = ({ session }) => (
  <span className="flex min-w-0 items-center gap-2">
    <span className="truncate">{session.name}</span>
    {session.kind === "regular" ? (
      <Chip className="bg-pk-primary text-white">정기</Chip>
    ) : (
      <Chip className="border border-pk-primary-line bg-white text-pk-primary">회원 세션</Chip>
    )}
  </span>
);

/** "11월 19일 목요일 · 18:00~22:00 · <끝>" 시각이 없으면 날짜와 끝 값만 */
export const formatSessionSubtitle = (
  session: Pick<ManagedMatchSession, "date" | "startTime" | "endTime">,
  tail: string,
): string =>
  [formatKstDateWithWeekday(session.date), formatSessionTimeRange(session), tail]
    .filter(Boolean)
    .join(" · ");

/** 패널 아래쪽 위험 작업 구획(취소·삭제) */
export const DangerSection: React.FC<{
  title: string;
  description: React.ReactNode;
  action: React.ReactNode;
}> = ({ title, description, action }) => (
  <section className="rounded-pk-sm bg-pk-bg p-4">
    <h3 className="text-pk-15 font-bold text-pk-ink">{title}</h3>
    <p className="mt-1 text-pk-13 text-pk-sub">{description}</p>
    <div className="mt-3">{action}</div>
  </section>
);

/** 패널 안 조회 중·실패 문구 */
export const PanelStatus: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-pk-13 text-pk-muted">{children}</p>
);
