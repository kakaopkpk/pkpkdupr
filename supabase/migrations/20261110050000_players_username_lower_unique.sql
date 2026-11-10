-- username 유일성을 대소문자 구분 없이 DB 제약으로 보장한다.
-- - 표시용 대소문자는 보존하고, lower(username) 유니크 인덱스로 'Alice'와 'alice'가 함께 들어가지 못하게 한다.
-- - 이 인덱스가 대소문자 구분 유니크 제약과 lower(username) 조회 인덱스를 모두 대신하므로 둘은 지운다.
-- - 대소문자만 다른 username이 이미 있으면 CREATE UNIQUE INDEX가 실패하고 마이그레이션 전체가 롤백된다.
--   적용(또는 운영 데이터 이관) 전에 아래 쿼리로 중복을 찾아 정리한다.
--
--   SELECT lower(username) AS username_lower, array_agg(username ORDER BY username) AS usernames, count(*)
--   FROM players
--   GROUP BY lower(username)
--   HAVING count(*) > 1;

CREATE UNIQUE INDEX players_username_lower_unique ON players (lower(username));

ALTER TABLE players DROP CONSTRAINT players_username_unique;

DROP INDEX players_username_lower_idx;
