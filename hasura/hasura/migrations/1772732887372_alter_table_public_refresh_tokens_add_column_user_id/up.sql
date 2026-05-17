-- Safe on fresh DB (legacy public.refresh_tokens may not exist yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'refresh_tokens'
  ) THEN
    ALTER TABLE public.refresh_tokens ADD COLUMN IF NOT EXISTS user_id uuid;
  END IF;
END $$;
