-- 경기 결과 합의(참가자 승인·자동 합의) 단계를 없앤다.
--   1. pg_cron 작업 auto-approvals를 해제한다(없으면 건너뛴다).
--   2. 합의 대기(pending-approval) 경기를 completed로 바꾼다.
--   3. 승인 테이블 match_result_approvals와 matches의 자동 합의 컬럼·인덱스를 삭제한다.
--
-- 전환된 경기와 자동 합의로 완료됐지만 평점 반영이 안 된 경기는 SQL로 평점을 계산할 수 없다.
-- 배포 직후 관리자가 admin-web '평점 재계산'(POST /api/admin/ratings/recalculate)을 1회 실행한다.
--
-- 시각 컬럼은 모두 epoch 초 단위 BIGINT다.

DO $$
BEGIN
  -- pg_cron이 없는 환경에서는 cron.job 참조 자체가 실패하므로 테이블 존재부터 확인한다.
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-approvals') THEN
      PERFORM cron.unschedule('auto-approvals');
    END IF;
  END IF;
END
$$;

UPDATE matches
SET
  status = 'completed',
  completed_at = COALESCE(result_submitted_at, FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT),
  updated_at = FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT
WHERE status = 'pending-approval';

DROP TABLE IF EXISTS match_result_approvals;

DROP INDEX IF EXISTS matches_status_auto_approval_due_at_idx;

ALTER TABLE matches
  DROP COLUMN IF EXISTS auto_approval_due_at,
  DROP COLUMN IF EXISTS auto_approved_at,
  DROP COLUMN IF EXISTS auto_approval_rating_applied_at;
