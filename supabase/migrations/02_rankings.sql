-- 02_rankings.sql
-- 랭킹 시스템 및 추가 기능을 위한 스키마 확장

-- 1. 일일 랭킹 스냅샷 (어제 Top 100 기록 보관용)
CREATE TABLE IF NOT EXISTS public.ranking_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL, -- 랭킹이 기록된 날짜 (YYYY-MM-DD 형식, KST 기준)
  rank INTEGER NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  equity NUMERIC NOT NULL,
  daily_pnl NUMERIC NOT NULL,
  daily_pnl_pct NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, user_id)
);

-- 성능 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_date ON public.ranking_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_user_id ON public.ranking_snapshots(user_id);
