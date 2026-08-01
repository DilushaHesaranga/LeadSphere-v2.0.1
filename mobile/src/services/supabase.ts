import { createClient } from "@supabase/supabase-js";

import { env } from "@/config/env";
import { secureSessionStorage } from "./secureSessionStorage";

export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
