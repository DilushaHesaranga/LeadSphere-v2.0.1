select
  to_regclass('public.ai_assistant_usage') is not null as usage_table_exists,
  has_table_privilege('authenticated', 'public.ai_assistant_usage', 'SELECT') as user_can_read_usage,
  has_table_privilege('authenticated', 'public.ai_assistant_usage', 'UPDATE') as user_can_update_usage,
  has_function_privilege('authenticated', 'public.claim_ai_assistant_request(uuid,uuid)', 'EXECUTE') as user_can_claim,
  has_function_privilege('anon', 'public.claim_ai_assistant_request(uuid,uuid)', 'EXECUTE') as anon_can_claim;
