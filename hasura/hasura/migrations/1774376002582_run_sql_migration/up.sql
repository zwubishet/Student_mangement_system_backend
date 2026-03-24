ALTER TABLE operations.examresults 
ADD CONSTRAINT examresults_exam_subject_student_key 
UNIQUE (exam_subject_id, student_id);
