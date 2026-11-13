import { createHash, timingSafeEqual } from "crypto";
import {
  addKstDays,
  getRegularSessionDateKeys,
  kstDateKeyToDate,
  REGULAR_SESSION_LOOKAHEAD_DAYS,
  toKstDateKey,
  type RegularSessionsCronResponse,
} from "@pkpkdupr/shared/session";
import type { MatchRepository } from "../repositories/MatchRepository";
import type {
  GoogleCalendarClient,
  GoogleCalendarListedEvent,
} from "./GoogleCalendarClient";

/**
 * 매일 예약 작업(POST /api/cron/regular-sessions)이 정기 세션을 오늘부터 4주치 미리 만든다.
 * 공휴일은 구글 "대한민국 공휴일" 캘린더로 확인해 DB에 남기고 건너뛴다.
 * 실패해도 다음 날 실행이 빈 회차를 메운다.
 */

export const KOREAN_HOLIDAY_CALENDAR_ID =
  "ko.south_korea#holiday@group.v.calendar.google.com";

/** 공휴일 캘린더 설명의 첫 단어. "공휴일"이 공휴일이고 "기념일"(식목일·어버이날 등)은 쉬는 날이 아니다 */
const PUBLIC_HOLIDAY_DESCRIPTION_PREFIX = "공휴일";

export class RegularSessionCronError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RegularSessionCronError";
  }
}

/** 헤더 값과 secret을 같은 길이의 해시로 바꿔 상수 시간에 비교한다(타이밍으로 secret을 추측하지 못하게) */
export const isCronSecretMatch = (provided: string, expected: string) =>
  timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );

/**
 * 공휴일 캘린더 일정에서 공휴일(설명이 "공휴일"로 시작) 날짜 키를 뽑는다.
 * 종일 일정의 end.date는 미포함이라 여러 날 일정은 start.date부터 end.date 전날까지 펼친다.
 */
export const extractPublicHolidayDateKeys = (
  events: GoogleCalendarListedEvent[],
): string[] => {
  const dateKeys = new Set<string>();
  for (const event of events) {
    const startDateKey = event.start?.date;
    if (
      !startDateKey ||
      !event.description?.trim().startsWith(PUBLIC_HOLIDAY_DESCRIPTION_PREFIX)
    ) {
      continue;
    }
    const endDateKey = event.end?.date;
    let dateKey = startDateKey;
    do {
      dateKeys.add(dateKey);
      dateKey = addKstDays(dateKey, 1);
    } while (endDateKey && dateKey < endDateKey);
  }
  return [...dateKeys].sort();
};

export interface RegularSessionCronDeps {
  now: Date;
  /** 구글 캘린더 연동이 꺼져 있으면 null */
  calendarClient: GoogleCalendarClient | null;
  repository: Pick<
    MatchRepository,
    | "addRegularSessionHolidays"
    | "deleteEmptyRegularSessions"
    | "ensureRegularSession"
    | "findRegularSessionSkips"
  >;
}

export const runRegularSessionCron = async ({
  now,
  calendarClient,
  repository,
}: RegularSessionCronDeps): Promise<RegularSessionsCronResponse> => {
  const fromDateKey = toKstDateKey(now);
  const toDateKey = addKstDays(fromDateKey, REGULAR_SESSION_LOOKAHEAD_DAYS);

  // 공휴일을 확인하지 못하면 공휴일에 세션을 만들 수 있으므로 아무것도 만들지 않는다
  if (!calendarClient) {
    throw new RegularSessionCronError(
      "구글 캘린더 연동 설정이 없어 공휴일을 확인할 수 없습니다.",
      503,
    );
  }
  let holidayDateKeys: string[];
  try {
    const events = await calendarClient.listEvents(KOREAN_HOLIDAY_CALENDAR_ID, {
      timeMin: kstDateKeyToDate(fromDateKey),
      timeMax: kstDateKeyToDate(toDateKey),
    });
    holidayDateKeys = extractPublicHolidayDateKeys(events).filter(
      (dateKey) => dateKey >= fromDateKey && dateKey < toDateKey,
    );
  } catch (error) {
    console.error("[CRON] 공휴일 캘린더 조회 실패", error);
    throw new RegularSessionCronError("공휴일을 확인하지 못했습니다.", 502);
  }

  await repository.addRegularSessionHolidays(holidayDateKeys);
  // 이미 만들어 둔 회차가 공휴일이면 아무도 참여하지 않았을 때만 지운다
  const deleted = await repository.deleteEmptyRegularSessions(holidayDateKeys);

  const skips = new Map(
    (await repository.findRegularSessionSkips(fromDateKey, toDateKey)).map(
      (skip) => [skip.dateKey, skip.reason] as const,
    ),
  );
  const created: string[] = [];
  const skipped: RegularSessionsCronResponse["skipped"] = [];
  for (const dateKey of getRegularSessionDateKeys(
    now,
    REGULAR_SESSION_LOOKAHEAD_DAYS,
  )) {
    const reason = skips.get(dateKey);
    if (reason) {
      skipped.push({ dateKey, reason });
      continue;
    }
    const result = await repository.ensureRegularSession(dateKey);
    if (result?.created) {
      created.push(dateKey);
    }
  }

  return { fromDateKey, toDateKey, created, skipped, deleted };
};
