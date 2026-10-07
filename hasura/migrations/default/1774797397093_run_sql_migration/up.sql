CREATE TABLE operations.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES identity.users(id),
  title text NOT NULL,
  content text NOT NULL,
  target_role text DEFAULT 'ALL', -- 'ALL', 'TEACHER', 'PARENT'
  priority text DEFAULT 'normal', -- 'low', 'normal', 'urgent'
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Index for fast loading of school-specific feeds
CREATE INDEX idx_announcements_school_role ON operations.announcements(school_id, target_role);
