CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
  (SELECT count(*) FROM student.students) AS student_count,
  (SELECT count(*) FROM academic.teachers) AS teacher_count,
  (SELECT count(*) FROM academic.classes) AS class_count,
  1 AS id; -- Adding a constant ID helps Apollo Cache track the object;
