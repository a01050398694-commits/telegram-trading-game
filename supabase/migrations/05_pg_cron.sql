-- 05_pg_cron.sql
-- D-05: pg_cron 확장 활성화 + 스케줄 등록.
-- 기본적으로 서버 크론(Node) 이 주 스케줄러지만, DB 수준 cleanup 작업이 필요할 때 대비.
--
-- 주의: pg_cron 은 Supabase Dashboard → Extensions 에서 먼저 활성화해야 한다.
-- 이 마이그레이션은 확장이 이미 설치된 상태를 전제로 스케줄만 등록한다.

-- 1. 확장 활성화 (이미 설치되어 있으면 no-op)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. 일일 자정(KST = UTC 15:00) 직전에 오래된 랭킹 스냅샷을 정리 (90일 이상)
-- 확실한 idempotency 를 위해 기존 잡을 먼저 unschedule 시도.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-ranking-snapshots'
  ) THEN
    PERFORM cron.unschedule('cleanup-old-ranking-snapshots');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-old-ranking-snapshots',
  '45 14 * * *',  -- 매일 UTC 14:45 = KST 23:45 (자정 직전)
  $$DELETE FROM public.ranking_snapshots WHERE date < (CURRENT_DATE - INTERVAL '90 days')$$
);

-- 3. 매시간 admin_actions 90일 이상 자료 보관 → 별도 archive 테이블로 옮기는 로직은 추후.
--    MVP 단계에선 관리자 행위 이력 전체 보관.
