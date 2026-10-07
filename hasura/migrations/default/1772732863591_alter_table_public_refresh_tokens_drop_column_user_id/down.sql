alter table "public"."refresh_tokens"
  add constraint "refresh_tokens_user_id_fkey"
  foreign key (user_id)
  references "public"."users"
  (id) on update no action on delete cascade;
alter table "public"."refresh_tokens" alter column "user_id" drop not null;
alter table "public"."refresh_tokens" add column "user_id" text;
