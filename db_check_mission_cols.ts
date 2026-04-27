import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await db.rpc('get_columns', { table_name: 'referral_missions' });
  if (error) {
    // try direct fetch from postgrest
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/referral_missions?limit=1`, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'Prefer': 'return=representation'
      },
      method: 'POST',
      body: JSON.stringify({})
    });
    const text = await res.text();
    console.log("Post error:", text);
  } else {
    console.log(data);
  }
}
main();
