ALTER TABLE academic.attendance 
ADD CONSTRAINT attendance_student_section_date_key 
UNIQUE (student_id, section_id, date);
