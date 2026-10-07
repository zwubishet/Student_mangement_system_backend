CREATE TABLE operations.Homeworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES identity.users(id),
    section_id UUID REFERENCES academic.sections(id),
    subject_id UUID REFERENCES academic.subjects(id),
    title TEXT,
    description TEXT,
    due_date DATE
);
