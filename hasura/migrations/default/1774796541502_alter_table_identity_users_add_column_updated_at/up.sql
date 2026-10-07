alter table "identity"."users" add column "updated_at" timestamptz
 null default now();
