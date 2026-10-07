-- Safe on fresh DB (legacy public.refresh_tokens may not exist yet)
ALTER TABLE IF EXISTS public.refresh_tokens DROP COLUMN IF EXISTS user_id CASCADE;
