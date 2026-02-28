-- 1. Drop existing tables (in reverse dependency order to avoid FK errors)
DROP TABLE IF EXISTS "RefreshToken" CASCADE;
DROP TABLE IF EXISTS directors CASCADE;
DROP TABLE IF EXISTS Seacher CASCADE;
DROP TABLE IF EXISTS student CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- If 'direactor' still exists (typo version)
DROP TABLE IF EXISTS direactor CASCADE;
