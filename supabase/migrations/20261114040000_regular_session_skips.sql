-- 정기 회차를 만들지 않는 KST 날짜(YYYY-MM-DD).
-- - holiday: 매일 예약 작업(POST /api/cron/regular-sessions)이 구글 "대한민국 공휴일" 캘린더에서 확인한 공휴일
-- - canceled: 관리자가 지운 오늘·미래 정기 세션의 날짜
-- 여기 있는 날짜의 정기 세션은 예약 작업·다가오는 세션 조회·경기 기록 어느 경로로도 새로 만들지 않는다.
CREATE TABLE regular_session_skips (
  date_key VARCHAR(10) NOT NULL CONSTRAINT regular_session_skips_pkey PRIMARY KEY,
  reason VARCHAR(16) NOT NULL
    CONSTRAINT regular_session_skips_reason_check CHECK (reason IN ('holiday', 'canceled')),
  created_at BIGINT NOT NULL
);

-- 기존 테이블과 같이 RLS on·정책 없음(기본 거부). DB 접근은 서버만 한다.
ALTER TABLE regular_session_skips ENABLE ROW LEVEL SECURITY;
