CREATE TABLE operations.ExamResults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_subject_id UUID REFERENCES operations.ExamSubjects(id),
    student_id UUID REFERENCES student.students(id),
    score NUMERIC,
    grade TEXT
);
