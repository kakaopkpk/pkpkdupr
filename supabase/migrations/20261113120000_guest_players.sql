-- 게스트 회원과 게스트 참여 경기의 평점 미반영.
-- - 게스트는 세션에서 회원이 추가한 비회원이다. Auth 계정이 없고(auth_user_id null) 성별 없이 만들 수 있다.
-- - 기존 회원은 모두 정회원(is_guest = false)이고 성별이 있다. 정회원 성별 필수는 api가 검사한다.
-- - guest_added_by_player_id·guest_added_session_id는 게스트를 추가한 회원과 세션이다(정회원은 null).
-- - matches.rating_excluded는 경기가 completed가 될 때 게스트가 끼어 있었는지다. 기존 경기는 모두 false다.

ALTER TABLE players
  ADD COLUMN is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN guest_added_by_player_id varchar(255),
  ADD COLUMN guest_added_session_id varchar(255);

ALTER TABLE players ALTER COLUMN gender DROP NOT NULL;

ALTER TABLE matches
  ADD COLUMN rating_excluded boolean NOT NULL DEFAULT false;
