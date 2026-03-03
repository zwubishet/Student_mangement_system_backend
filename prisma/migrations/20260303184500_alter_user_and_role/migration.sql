-- add super_admin to existing Role enum
-- extend existing Role enum with SUPER_ADMIN if necessary
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'SUPER_ADMIN' AND enumtypid = '"Role"'::regtype
        ) THEN
            ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
        END IF;
    END IF;
END
$$;

-- add schoolId column to users table if not exists
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS "schoolId" TEXT;

-- add FK constraint
-- Add foreign key constraint if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_users_school' AND table_name = 'users'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_school
            FOREIGN KEY ("schoolId") REFERENCES "School"(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- index for faster school lookups
CREATE INDEX IF NOT EXISTS idx_users_school ON users("schoolId");
