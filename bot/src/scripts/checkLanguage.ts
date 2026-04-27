import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('users')
    .select('telegram_id, language_code');
    
  if (error) {
    console.error('❌ Failed:', error);
  } else {
    console.log(data);
  }
}

main();
