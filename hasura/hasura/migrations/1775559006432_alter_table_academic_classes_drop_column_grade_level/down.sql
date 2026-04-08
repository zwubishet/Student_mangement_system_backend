alter table "academic"."classes" alter column "grade_level" drop not null;
alter table "academic"."classes" add column "grade_level" int4;
