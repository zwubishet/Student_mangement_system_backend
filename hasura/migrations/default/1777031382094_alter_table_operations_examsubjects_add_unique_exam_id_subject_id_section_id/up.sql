alter table "operations"."examsubjects" drop constraint "examsubjects_exam_id_subject_id_key";
alter table "operations"."examsubjects" add constraint "examsubjects_exam_id_subject_id_section_id_key" unique ("exam_id", "subject_id", "section_id");
