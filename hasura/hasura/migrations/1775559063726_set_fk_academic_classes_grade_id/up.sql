alter table "academic"."classes"
  add constraint "classes_grade_id_fkey"
  foreign key ("grade_id")
  references "academic"."grades"
  ("id") on update restrict on delete restrict;
