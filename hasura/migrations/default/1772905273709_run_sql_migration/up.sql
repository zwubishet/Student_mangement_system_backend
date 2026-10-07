CREATE TABLE academic.Attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,
    student_id UUID NOT NULL,
    section_id UUID NOT NULL,

    date DATE NOT NULL,

    status TEXT CHECK (status IN ('present','absent','late')),

    marked_by UUID,
    created_at TIMESTAMP DEFAULT now(),

    FOREIGN KEY (school_id) REFERENCES tenancy.schools(id),
    FOREIGN KEY (student_id) REFERENCES student.students(id),
    FOREIGN KEY (section_id) REFERENCES academic.sections(id)
);
