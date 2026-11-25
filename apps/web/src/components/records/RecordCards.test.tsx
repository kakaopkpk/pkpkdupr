import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MatchSessionDetailInfo } from "@/lib/matchSessions";
import type { MatchSessionHistoryInfo } from "@/lib/rankings";

// 아바타가 쓰는 lib/api가 Supabase 환경변수를 요구하므로 대신한다
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  resolveAssetUrl: (url?: string | null) => url ?? null,
}));

import { RecordSessionCard } from "./RecordCards";

const session: MatchSessionHistoryInfo = {
  id: "Sbungae01",
  name: "월요 번개",
  kind: "custom",
  date: "2026-11-23T10:00:00.000Z",
  dateKey: "2026-11-23",
  startTime: null,
  location: "야탑초등학교",
  participantCount: 6,
  matchCount: 3,
};

const participants = [
  "neiz.choi",
  "brad.ley",
  "meg.j",
  "colin.34",
  "dino.saur",
  "andrew.y",
].map((username) => ({ id: `P${username}`, username })) as MatchSessionDetailInfo["participants"];

describe("RecordSessionCard", () => {
  it("participants가 없으면(일정 탭) 메타 줄에 인원을 두고 참여자 줄이 없다", () => {
    const html = renderToStaticMarkup(
      <RecordSessionCard session={session} mine={null} />,
    );
    expect(html).toContain("야탑초등학교 · 6명 · 3경기");
    expect(html).not.toContain("명 참여");
  });

  it("participants가 있으면(세션 상세 머리) 인원을 메타 줄에서 빼고 참여자 줄(아바타 4개 + 나머지 수)을 둔다", () => {
    const html = renderToStaticMarkup(
      <RecordSessionCard
        session={session}
        mine={null}
        showDate
        participants={participants}
        onOpenParticipants={() => {}}
      />,
    );
    expect(html).toContain("야탑초등학교 · 3경기");
    expect(html).not.toContain("· 6명 ·");
    expect(html).toMatch(/<button[^>]*>.*6명 참여/);
    expect(html).toContain("+2");
  });
});
