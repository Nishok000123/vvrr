import { createClient } from '@supabase/supabase-js';
import { required } from './config.js';

export const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});

export type Media = {
  id: string;
  source_id: string;
  telegram_message_id: number;
  file_name: string | null;
  caption: string | null;
  normalized_title: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
};
