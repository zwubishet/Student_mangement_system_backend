CREATE TABLE operations.AttendanceSessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID REFERENCES academic.sections(id),
    subject_id UUID REFERENCES academic.subjects(id),
    teacher_id UUID REFERENCES identity.users(id),
    date DATE
);
