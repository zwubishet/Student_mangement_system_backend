CREATE TABLE academic.ParentStudents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    school_id UUID NOT NULL,

    parent_id UUID NOT NULL,
    student_id UUID NOT NULL,

    created_at TIMESTAMP DEFAULT now(),

    FOREIGN KEY (school_id) REFERENCES tenancy.schools(id),
    FOREIGN KEY (parent_id) REFERENCES academic.parents(id),
    FOREIGN KEY (student_id) REFERENCES student.students(id)
);
