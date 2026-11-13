-- 평점 차트 projection 저장 형식이 경기일별 평점으로 바뀌어 기존 캐시를 비운다.
-- 다음 조회 때 선수별로 다시 만들어진다.
DELETE FROM player_rating_chart_points;
DELETE FROM player_rating_chart_projections;
