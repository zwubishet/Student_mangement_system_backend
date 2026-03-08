CREATE TABLE student.Guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES student.students(id),
    name TEXT,
    phone TEXT,
    relation TEXT
);
