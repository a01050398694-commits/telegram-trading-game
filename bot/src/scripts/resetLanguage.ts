import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('users')
    .update({ language_code: 'en' })
    .neq('language_code', 'en');
    
  if (error) {
    console.error('❌ Failed to reset language_code:', error);
  } else {
    console.log('✅ Successfully reset all non-English users to en.');
  }
}

main();
