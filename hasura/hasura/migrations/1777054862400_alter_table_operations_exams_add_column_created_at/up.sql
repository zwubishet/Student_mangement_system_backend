alter table "operations"."exams" add column "created_at" timestamptz
 null default now();
