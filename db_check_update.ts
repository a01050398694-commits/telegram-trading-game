import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await db.from('users').update({ is_verified: true }).eq('telegram_id', 7626898903).select();
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}
main();
