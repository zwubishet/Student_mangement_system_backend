-- create school table and link to users
CREATE TYPE "Role" AS ENUM ('STUDENT','TEACHER','DIRECTOR','SUPER_ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";

CREATE TABLE "School" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- add nullable foreign key on user to school
ALTER TABLE "User"
    ADD COLUMN "schoolId" TEXT REFERENCES "School" (id) ON DELETE SET NULL;

-- optionally create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_school ON "User"("schoolId");
