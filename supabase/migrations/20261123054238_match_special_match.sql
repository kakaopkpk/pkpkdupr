-- 경기 시작 때 판정한 특수 매치(SpecialMatch: 유형·지키는 팀·주인공·도전 쌍·결과).
-- 추천 카드·'같은 멤버로 한 판 더'로 시작한 경기만 값이 있고, 그 밖과 기존 경기는 null이다.
-- 조회 조건으로 쓰지 않고 결과(outcome)가 같은 객체에 붙어 jsonb 한 컬럼으로 둔다.
ALTER TABLE matches
  ADD COLUMN special_match JSONB;
