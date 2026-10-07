CREATE TABLE operations.ExamSubjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES operations.exams(id),
    subject_id UUID REFERENCES academic.subjects(id),
    max_score INT
);
