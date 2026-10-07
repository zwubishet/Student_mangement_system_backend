#!/usr/bin/env bash
# Shared seed runners (requires init.sh).

sms_require_seed_env() {
  sms_require_docker
  command -v node >/dev/null 2>&1 || sms_die "Node.js is required to run seeds on the host"
  sms_wait_healthy postgres 60
  sms_postgres_host_reachable || sms_die "Postgres is not reachable on localhost:5432 — run: npm run stack:up"
}

sms_run_seed_script() {
  local file="$1"
  local path="$SMS_ROOT/scripts/seeds/$file"
  [[ -f "$path" ]] || sms_die "Seed script not found: $file"
  DATABASE_URL="$SMS_DB_URL_LOCAL" node "$path"
}

sms_print_seed_credentials() {
  sms_info "School admin:  admin@demoschool.edu / DemoAdmin123!"
  sms_info "Super admin:   superadmin@edumanage.io / SuperAdmin123!"
  sms_info "Teachers:      teacher01@demo.local / Teacher123!"
  sms_info "Students:      DEMO-G9A-001@demo.local / Student123!"
}
