#!/usr/bin/env bash
# Hasura CLI wrappers (requires env.sh). Pinned to 2.26.0 to match graphql-engine in Docker.

sms_hasura_cli() {
  npx --yes hasura-cli@2.26.0 "$@"
}

sms_hasura_migrate_apply() {
  [[ -d "$SMS_HASURA_DIR/migrations/default" ]] || sms_die "Migrations not found: $SMS_HASURA_DIR/migrations/default"
  sms_bold "Applying Hasura migrations (SQL)"
  (
    cd "$SMS_HASURA_DIR"
    sms_hasura_cli migrate apply \
      --endpoint "$HASURA_ENDPOINT" \
      --admin-secret "$HASURA_ADMIN_SECRET" \
      --database-name default
  )
}

sms_hasura_metadata_apply() {
  [[ -f "$SMS_HASURA_DIR/metadata/tables.yaml" ]] || sms_die "Missing $SMS_HASURA_DIR/metadata/tables.yaml"
  sms_bold "Applying Hasura metadata"
  (
    cd "$SMS_HASURA_DIR"
    sms_hasura_cli metadata apply \
      --endpoint "$HASURA_ENDPOINT" \
      --admin-secret "$HASURA_ADMIN_SECRET"
  ) || sms_die "Metadata apply failed (check metadata/tables.yaml and CLI 2.26 vs engine)"
}

sms_hasura_verify_webhooks() {
  bash "$SMS_ROOT/scripts/hasura/verify-webhooks.sh"
}

sms_hasura_migrate_status() {
  if ! curl -sf "${HASURA_ENDPOINT}/healthz" >/dev/null 2>&1; then
    sms_warn "Hasura not reachable at $HASURA_ENDPOINT — run: npm run stack:up"
    return 1
  fi
  sms_bold "Hasura migration status"
  (
    cd "$SMS_HASURA_DIR"
    sms_hasura_cli migrate status \
      --endpoint "$HASURA_ENDPOINT" \
      --admin-secret "$HASURA_ADMIN_SECRET" \
      --database-name default
  ) 2>/dev/null || sms_warn "Could not read Hasura status"
}
