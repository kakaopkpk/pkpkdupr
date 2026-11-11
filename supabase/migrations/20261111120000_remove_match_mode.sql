-- 경기 모드(단판·2선승) 구분을 없애고 경기는 단판만 지원한다.
-- 점수가 여러 개인 과거 2선승 기록은 match_scores에 그대로 남아 조회·평점 재계산에 쓰인다.

ALTER TABLE matches DROP COLUMN IF EXISTS mode;
