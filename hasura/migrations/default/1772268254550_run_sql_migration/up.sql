-- 1. Drop existing tables (in reverse dependency order to avoid FK errors)
DROP TABLE IF EXISTS "RefreshToken" CASCADE;
DROP TABLE IF EXISTS "Director" CASCADE;
DROP TABLE IF EXISTS "Teacher" CASCADE;
DROP TABLE IF EXISTS "Student" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- If 'direactor' still exists (typo version)
DROP TABLE IF EXISTS "direactor" CASCADE;
