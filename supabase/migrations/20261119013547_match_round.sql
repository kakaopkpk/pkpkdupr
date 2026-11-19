-- 대회 대진 라운드(1부터). 관리자가 대진으로 만든 경기만 값이 있다.
-- 대진 예정 경기(status 'scheduled')는 라운드가 반드시 있다.
ALTER TABLE matches
  ADD COLUMN round INTEGER;

ALTER TABLE matches
  ADD CONSTRAINT matches_round_check CHECK (round IS NULL OR round >= 1),
  ADD CONSTRAINT matches_scheduled_round_check
    CHECK (status <> 'scheduled' OR round IS NOT NULL);
