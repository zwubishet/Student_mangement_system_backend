ALTER TABLE operations.examsubjects 
ADD CONSTRAINT examsubjects_exam_id_subject_id_key 
UNIQUE (exam_id, subject_id);
