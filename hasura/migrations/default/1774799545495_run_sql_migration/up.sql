CREATE TABLE academic.term_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES tenancy.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student.students(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES academic.terms(id) ON DELETE CASCADE,
  total_score numeric(5,2), -- e.g., 85.50
  average_percentage numeric(5,2),
  letter_grade text,
  class_rank integer,
  is_finalized boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (student_id, term_id) -- One summary per student per term
);

CREATE INDEX idx_term_summary_lookup ON academic.term_summaries(term_id, school_id);
