import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env.js';

// 백엔드(bot)는 RLS 우회를 위해 service_role 키를 쓰는 게 정석.
// service_role이 없으면 anon으로 폴백 — 단, RLS 정책을 통과하는 동작만 가능.
export function createSupabase(): SupabaseClient {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      '[db] SUPABASE_SERVICE_ROLE_KEY 미설정 — anon 키로 동작. RLS 정책에 막혀 쓰기가 실패할 수 있음.',
    );
  }

  return createClient(env.SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type Db = SupabaseClient;
