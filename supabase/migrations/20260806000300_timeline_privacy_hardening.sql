-- Browser clients must use the redacting Timeline RPCs. RLS remains enabled as
-- defense in depth, while direct table access cannot bypass field-level privacy.
revoke all on public.crm_ticket_communications from anon, authenticated;
