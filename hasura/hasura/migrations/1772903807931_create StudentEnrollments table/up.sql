CREATE TABLE student.StudentEnrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES student.students(id),
    section_id UUID REFERENCES academic.sections(id),
    academic_year_id UUID REFERENCES academic.AcademicYears(id)
);
