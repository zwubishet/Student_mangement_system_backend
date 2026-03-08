CREATE TABLE academic.TeacherAssignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES identity.users(id),
    subject_id UUID REFERENCES academic.subjects(id),
    section_id UUID REFERENCES academic.sections(id)
);
