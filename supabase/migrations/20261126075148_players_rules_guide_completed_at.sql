-- 회원이 피클볼 기본 규칙 안내를 처음 끝까지 읽은 시각(Unix 초). 읽지 않았으면 null이다(업적 모범생).
ALTER TABLE players ADD COLUMN rules_guide_completed_at BIGINT;

-- 경기와 무관한 업적(모범생)은 획득 경기가 없어 확인 기록의 earned_match_id가 null이다.
ALTER TABLE player_seen_achievements ALTER COLUMN earned_match_id DROP NOT NULL;
