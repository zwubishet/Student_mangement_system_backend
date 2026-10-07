alter table "operations"."examsubjects"
  add constraint "examsubjects_section_id_fkey"
  foreign key ("section_id")
  references "academic"."sections"
  ("id") on update restrict on delete restrict;
