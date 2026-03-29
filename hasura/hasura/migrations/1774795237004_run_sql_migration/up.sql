ALTER TABLE academic.parentstudents 
ADD CONSTRAINT parent_student_unique_key 
UNIQUE (parent_id, student_id);
