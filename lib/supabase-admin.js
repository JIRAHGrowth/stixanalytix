import { createClient } from '@supabase/supabase-js';

// Admin client — uses service role key for privileged operations
// ONLY use this in server-side API routes, never in client components
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

