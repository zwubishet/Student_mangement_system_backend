-- Digital resource library + section sharing + physical book catalog

CREATE SCHEMA IF NOT EXISTS library;

-- ─── Global categories (MoE-aligned types) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS library.resource_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  name_am     VARCHAR(100),
  icon        VARCHAR(50),
  description TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resource_category_name UNIQUE (name)
);

INSERT INTO library.resource_categories (name, name_am, icon, sort_order) VALUES
  ('Textbook',            'የተማሪ መፅሐፍ',       'book',         1),
  ('Teacher Guide',       'የመምህር መምሪያ',      'book-open',    2),
  ('Past Exam Paper',     'ያለፈ ፈተና',          'file-text',    3),
  ('Worksheet',           'የስራ ወረቀት',         'clipboard',    4),
  ('Lesson Summary',      'የትምህርት ማጠቃለያ',    'file',         5),
  ('Reference Material',  'የማጣቀሻ ቁሳቁስ',     'bookmark',     6),
  ('Video Lesson',        'የቪዲዮ ትምህርት',      'video',        7),
  ('School Announcement', 'የትምህርት ቤት ማስታወቂያ', 'bell',         8),
  ('Other',               'ሌላ',               'folder',       9)
ON CONFLICT (name) DO NOTHING;

-- ─── Digital resources ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library.resources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  category_id         UUID NOT NULL REFERENCES library.resource_categories(id),
  grade_id            UUID REFERENCES academic.grades(id) ON DELETE SET NULL,
  subject_id          UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  academic_year_id    UUID REFERENCES academic.academicyears(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  title_am            TEXT,
  description         TEXT,
  author              TEXT,
  publisher           TEXT,
  published_year      SMALLINT,
  language            TEXT NOT NULL DEFAULT 'english',
  edition             TEXT,
  keywords            TEXT[],
  file_type           TEXT,
  file_id             UUID REFERENCES infrastructure.files(id) ON DELETE SET NULL,
  file_name           TEXT,
  file_size_bytes     BIGINT,
  thumbnail_url       TEXT,
  external_url        TEXT,
  duration_minutes    SMALLINT,
  access_level        TEXT NOT NULL DEFAULT 'school'
    CHECK (access_level IN ('public', 'school', 'teachers', 'section')),
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'published', 'archived')),
  uploaded_by         UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_by         UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  deleted_at          TIMESTAMPTZ,
  view_count          INTEGER NOT NULL DEFAULT 0,
  download_count      INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library.resource_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id     UUID NOT NULL REFERENCES library.resources(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  file_id         UUID REFERENCES infrastructure.files(id) ON DELETE SET NULL,
  file_url        TEXT,
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_size_bytes BIGINT,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library.resource_section_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  resource_id  UUID NOT NULL REFERENCES library.resources(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES academic.sections(id) ON DELETE CASCADE,
  subject_id   UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  shared_by    UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  shared_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  unpinned_at  TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT uq_resource_section_share UNIQUE (resource_id, section_id)
);

CREATE TABLE IF NOT EXISTS library.resource_bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES library.resources(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resource_bookmark UNIQUE (user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS library.resource_access_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES library.resources(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  school_id   UUID REFERENCES tenancy.schools(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (action IN ('view', 'download', 'stream')),
  ip_address  INET,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Physical book catalog ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library.library_books (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  title_am         TEXT,
  author           TEXT,
  isbn             VARCHAR(20),
  publisher        TEXT,
  published_year   SMALLINT,
  category         TEXT,
  subject_id       UUID REFERENCES academic.subjects(id) ON DELETE SET NULL,
  grade_id         UUID REFERENCES academic.grades(id) ON DELETE SET NULL,
  language         TEXT NOT NULL DEFAULT 'amharic',
  total_copies     SMALLINT NOT NULL DEFAULT 1 CHECK (total_copies > 0),
  available_copies SMALLINT NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
  shelf_location   TEXT,
  cover_image_url  TEXT,
  description      TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_book_copies CHECK (available_copies <= total_copies)
);

CREATE TABLE IF NOT EXISTS library.book_borrowings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  book_id          UUID NOT NULL REFERENCES library.library_books(id) ON DELETE CASCADE,
  borrower_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  borrower_type    TEXT NOT NULL CHECK (borrower_type IN ('student', 'teacher')),
  issued_by        UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  returned_to      UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  borrow_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,
  return_date      DATE,
  status           TEXT NOT NULL DEFAULT 'borrowed'
    CHECK (status IN ('borrowed', 'returned', 'overdue', 'lost')),
  fine_per_day_etb NUMERIC(6,2) NOT NULL DEFAULT 2.00,
  fine_paid        BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library.book_reservations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES library.library_books(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'fulfilled', 'cancelled')),
  notified_at  TIMESTAMPTZ
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resources_school_status
  ON library.resources(school_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_grade_subject
  ON library.resources(grade_id, subject_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_global
  ON library.resources(status) WHERE school_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_title_fts
  ON library.resources USING GIN (to_tsvector('english', coalesce(title, '')));

CREATE INDEX IF NOT EXISTS idx_shares_section
  ON library.resource_section_shares(section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shares_teacher
  ON library.resource_section_shares(shared_by, school_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shares_resource
  ON library.resource_section_shares(resource_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shares_pinned
  ON library.resource_section_shares(section_id, is_pinned)
  WHERE is_pinned = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_library_books_school
  ON library.library_books(school_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_borrowings_borrower
  ON library.book_borrowings(borrower_id, status);
CREATE INDEX IF NOT EXISTS idx_borrowings_overdue
  ON library.book_borrowings(due_date, status) WHERE status = 'borrowed';

CREATE INDEX IF NOT EXISTS idx_access_logs_resource
  ON library.resource_access_logs(resource_id, accessed_at);
