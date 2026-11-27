#!/usr/bin/env bash
# Starts LobbyStack on this machine from prebuilt images, with only an OpenAI API key.
#
#   curl -fsSL https://raw.githubusercontent.com/lobbystack/lobbystack/main/scripts/quickstart.sh | bash
#
# Piped like this, it creates ./lobbystack, downloads docker-compose.quickstart.yml
# into it and keeps its settings in ./lobbystack/.env. Run from a clone
# (./scripts/quickstart.sh), it uses the clone's docker-compose.quickstart.yml and
# keeps its settings in .env.quickstart at the root of the clone.
#
# Running it again keeps every secret and the database. It only fills in what's
# missing, pulls newer images and restarts what changed.
#
# Settings, read from the environment:
#   OPENAI_API_KEY           Used instead of asking. Export it: `curl ... | bash` doesn't
#                            pass a variable set in front of curl to bash.
#   LOBBYSTACK_DIR           Where the piped install goes. Defaults to ./lobbystack.
#   LOBBYSTACK_PORT          Dashboard port on 127.0.0.1. Defaults to 3000.
#   LOBBYSTACK_MAIL_PORT     Mailpit port on 127.0.0.1. Defaults to 8025.
#   LOBBYSTACK_VERSION       Image tag, such as 1.2.0. Defaults to latest.
#   LOBBYSTACK_IMAGE_PREFIX  Image name before -admin, -worker and -migrator.
#                            Defaults to ghcr.io/lobbystack/lobbystack.
#   LOBBYSTACK_PULL          always (the default), missing, or never.
#   LOBBYSTACK_PROJECT       Docker Compose project name. Defaults to lobbystack.
#   LOBBYSTACK_REPO_RAW      Where the piped install downloads the compose file from.
#   LOBBYSTACK_SKIP_KEY_CHECK  Set to 1 to skip asking OpenAI whether the key works.
set -euo pipefail

COMPOSE_NAME="docker-compose.quickstart.yml"
REPO_RAW="${LOBBYSTACK_REPO_RAW:-https://raw.githubusercontent.com/lobbystack/lobbystack/main}"
HEALTH_TIMEOUT_SECONDS="${LOBBYSTACK_HEALTH_TIMEOUT:-600}"

if [[ -t 1 ]]; then
  bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'; reset=$'\033[0m'
else
  bold=""; red=""; green=""; reset=""
fi

say() { printf '%s\n' "$*"; }
step() { printf '\n%s==> %s%s\n' "$bold" "$*" "$reset"; }
die() {
  printf '\n%sError:%s %s\n' "$red" "$reset" "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}

# --- Where the install lives -------------------------------------------------------

# Run from a file in a clone, the compose file sits one directory up. Piped into
# bash, there is no such file.
script_path="${BASH_SOURCE[0]:-}"
repo_root=""
if [[ -n "$script_path" && -f "$script_path" ]]; then
  candidate="$(cd "$(dirname "$script_path")/.." && pwd)"
  [[ -f "$candidate/$COMPOSE_NAME" ]] && repo_root="$candidate"
fi

if [[ -n "$repo_root" ]]; then
  mode="clone"
  install_dir="$repo_root"
  compose_file="$repo_root/$COMPOSE_NAME"
  env_file="$repo_root/.env.quickstart"
else
  mode="download"
  install_dir="${LOBBYSTACK_DIR:-$PWD/lobbystack}"
  compose_file="$install_dir/$COMPOSE_NAME"
  env_file="$install_dir/.env"
fi

# --- Prerequisites -----------------------------------------------------------------

step "Checking Docker"
case "$(uname -s)" in
  Darwin) os="macOS" ;;
  Linux) if grep -qi microsoft /proc/version 2>/dev/null; then os="WSL"; else os="Linux"; fi ;;
  MINGW* | MSYS* | CYGWIN*)
    die "This script doesn't run in Git Bash or Cygwin." \
      "On Windows, install WSL 2 and Docker Desktop with WSL integration on, then run it in your WSL terminal." ;;
  *) os="$(uname -s)" ;;
esac

command -v docker >/dev/null 2>&1 || die "Docker isn't installed." \
  "Install Docker Desktop (macOS, Windows) or Docker Engine (Linux): https://docs.docker.com/get-docker/"

if ! docker_info="$(docker info 2>&1)"; then
  if grep -qi "permission denied" <<<"$docker_info"; then
    die "Your user can't reach the Docker daemon." \
      "Add yourself to the docker group with: sudo usermod -aG docker \"\$USER\"" \
      "Then log out and back in, and run this script again."
  fi
  die "Docker isn't running." "Start Docker Desktop, or the Docker service on Linux, and run this script again."
fi

compose_version="$(docker compose version --short 2>/dev/null || true)"
[[ -n "$compose_version" ]] || die "Docker Compose v2 isn't installed." \
  "It comes with Docker Desktop. On Linux, install the docker-compose-plugin package: https://docs.docker.com/compose/install/linux/"
compose_major="${compose_version#v}"
compose_major="${compose_major%%.*}"
[[ "$compose_major" =~ ^[0-9]+$ && "$compose_major" -ge 2 ]] || die "Docker Compose $compose_version is too old." "Update to Compose v2 or later."

if [[ "$mode" == "download" ]]; then command -v curl >/dev/null 2>&1 || die "curl isn't installed."; fi
say "$os, Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), Compose $compose_version"

# --- The compose file ---------------------------------------------------------------

if [[ "$mode" == "download" ]]; then
  step "Preparing $install_dir"
  mkdir -p "$install_dir"
  if [[ -f "$compose_file" ]]; then
    say "Keeping the $COMPOSE_NAME that's already there."
  else
    tmp="$(mktemp "$install_dir/.compose.XXXXXX")"
    curl -fsSL "$REPO_RAW/$COMPOSE_NAME" -o "$tmp" || { rm -f "$tmp"; die "Couldn't download $REPO_RAW/$COMPOSE_NAME."; }
    chmod 644 "$tmp"
    mv "$tmp" "$compose_file"
    say "Downloaded $COMPOSE_NAME."
  fi
else
  step "Using the clone at $install_dir"
fi

# --- Settings and secrets -------------------------------------------------------------

env_value() {
  # Prints the value of $1 in the env file, or nothing.
  [[ -f "$env_file" ]] || return 0
  sed -n "s/^$1=//p" "$env_file" | tail -n 1
}

set_env() {
  # Sets $1=$2 in the env file, replacing an existing line.
  local tmp
  tmp="$(mktemp "$env_file.XXXXXX")"
  if [[ -f "$env_file" ]]; then grep -v "^$1=" "$env_file" >"$tmp" || true; fi
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$env_file"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

step "Writing settings to $env_file"
umask 077
project="${LOBBYSTACK_PROJECT:-lobbystack}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "LOBBYSTACK_PROJECT may hold only lowercase letters, digits, - and _."

# A database volume without its .env can't be opened: its passwords are gone.
if [[ ! -f "$env_file" ]] && docker volume inspect "${project}_postgres_data" >/dev/null 2>&1; then
  die "A LobbyStack database already exists in the Docker volume ${project}_postgres_data, but $env_file, which holds its passwords, doesn't." \
    "If you moved the install, run this script where its .env is." \
    "To start over and delete that data, run: docker volume rm ${project}_postgres_data ${project}_redis_data ${project}_storage_data"
fi

if [[ ! -f "$env_file" ]]; then
  printf '# LobbyStack quickstart settings. Generated by scripts/quickstart.sh; keep this file private.\n' >"$env_file"
  chmod 600 "$env_file"
fi

if [[ "$mode" == "download" ]]; then
  # Lets `docker compose` find the compose file and project from this directory.
  [[ -n "$(env_value COMPOSE_FILE)" ]] || set_env COMPOSE_FILE "$COMPOSE_NAME"
  [[ -n "$(env_value COMPOSE_PROJECT_NAME)" ]] || set_env COMPOSE_PROJECT_NAME "$project"
fi

generated=0
for name in POSTGRES_PASSWORD LOBBYSTACK_MIGRATOR_PASSWORD LOBBYSTACK_AUTH_PASSWORD LOBBYSTACK_APP_PASSWORD \
  LOBBYSTACK_WORKER_PASSWORD LOBBYSTACK_DISPATCHER_PASSWORD LOBBYSTACK_READONLY_PASSWORD BETTER_AUTH_SECRET \
  ENCRYPTION_KEY INTERNAL_SERVICE_SECRET INTERNAL_SERVICE_TOKEN OTP_HASH_SECRET WIDGET_SESSION_SECRET \
  LOCAL_STORAGE_SIGNING_SECRET NUMBER_CLAIM_TOKEN_SECRET; do
  if [[ -z "$(env_value "$name")" ]]; then
    set_env "$name" "$(random_secret)"
    generated=$((generated + 1))
  fi
done
if ((generated > 0)); then say "Generated $generated secrets and database passwords."; else say "Kept the existing secrets."; fi

# Settings passed in the environment win over the file, so a rerun can change them.
for name in LOBBYSTACK_PORT LOBBYSTACK_MAIL_PORT LOBBYSTACK_VERSION LOBBYSTACK_IMAGE_PREFIX; do
  value="${!name:-}"
  [[ -n "$value" ]] && set_env "$name" "$value"
done

valid_key() { [[ "$1" =~ ^[A-Za-z0-9_-]{20,}$ ]]; }

saved_key="$(env_value OPENAI_API_KEY)"
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  valid_key "$OPENAI_API_KEY" || die "OPENAI_API_KEY in your environment doesn't look like an OpenAI API key."
  if [[ "$OPENAI_API_KEY" != "$saved_key" ]]; then set_env OPENAI_API_KEY "$OPENAI_API_KEY"; say "Saved the OpenAI API key from your environment."; fi
elif [[ -n "$saved_key" ]]; then
  say "Kept the saved OpenAI API key."
else
  { : </dev/tty; } 2>/dev/null || die "No OpenAI API key, and no terminal to ask for one." \
    "Export OPENAI_API_KEY and run the script again."
  say "LobbyStack needs an OpenAI API key for calls. Create one at https://platform.openai.com/api-keys"
  key=""
  while ! valid_key "$key"; do
    printf 'OpenAI API key (hidden): ' >/dev/tty
    IFS= read -rs key </dev/tty || die "Couldn't read the key."
    printf '\n' >/dev/tty
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    valid_key "$key" || say "That doesn't look like an OpenAI API key. Paste the whole key, which starts with sk-."
  done
  set_env OPENAI_API_KEY "$key"
  unset key
  say "Saved the key."
fi

# A rejected key only shows up later as a test call that won't start, so ask
# OpenAI now. The key goes to OpenAI alone, through stdin, never the process list.
if [[ "${LOBBYSTACK_SKIP_KEY_CHECK:-}" != "1" ]] && command -v curl >/dev/null 2>&1; then
  status="$(printf 'Authorization: Bearer %s\n' "$(env_value OPENAI_API_KEY)" |
    curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -H @- https://api.openai.com/v1/models 2>/dev/null || true)"
  case "$status" in
    200) say "OpenAI accepted the key." ;;
    401 | 403)
      die "OpenAI rejected the API key (HTTP $status). It may be expired, revoked or mistyped." \
        "Create a key at https://platform.openai.com/api-keys, then either export OPENAI_API_KEY and run this script again," \
        "or replace OPENAI_API_KEY in $env_file and run it again." ;;
    *) say "Couldn't check the key with OpenAI (HTTP ${status:-none}). Continuing." ;;
  esac
fi

port="$(env_value LOBBYSTACK_PORT)"; port="${port:-3000}"
mail_port="$(env_value LOBBYSTACK_MAIL_PORT)"; mail_port="${mail_port:-8025}"
url="http://localhost:$port"

# --- Start ----------------------------------------------------------------------------

compose=(docker compose --project-name "$project" --project-directory "$install_dir" -f "$compose_file" --env-file "$env_file")

# How to run Compose by hand from the install directory.
if [[ "$mode" == "download" ]]; then
  manage="docker compose"
else
  manage="docker compose -p $project -f $COMPOSE_NAME --env-file .env.quickstart"
fi
logs_hint="Logs: cd $install_dir && $manage logs --tail 100"

pull="${LOBBYSTACK_PULL:-always}"
case "$pull" in always | missing | never) ;; *) die "LOBBYSTACK_PULL must be always, missing or never." ;; esac

step "Starting LobbyStack"
if ! "${compose[@]}" up --detach --pull "$pull" --remove-orphans; then
  die "Docker Compose couldn't start the stack." \
    "If a port is already in use, set LOBBYSTACK_PORT or LOBBYSTACK_MAIL_PORT and run the script again." \
    "$logs_hint"
fi

step "Waiting for LobbyStack to be ready"
container_state() {
  # Prints "<state> <health> <exit code>" for one service's container.
  local id
  id="$("${compose[@]}" ps --all --quiet "$1" 2>/dev/null | head -n 1)"
  [[ -n "$id" ]] || { echo "missing none 0"; return; }
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.ExitCode}}' "$id"
}

deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
while :; do
  read -r migrator_status _ migrator_exit <<<"$(container_state migrator)"
  if [[ "$migrator_status" == "exited" && "$migrator_exit" != "0" ]]; then
    "${compose[@]}" logs --tail 40 migrator >&2 || true
    die "The database migration failed (above)." "$logs_hint migrator"
  fi
  read -r _ admin_health _ <<<"$(container_state admin)"
  read -r _ worker_health _ <<<"$(container_state worker)"
  if [[ "$admin_health" == "healthy" && "$worker_health" == "healthy" ]]; then break; fi
  if ((SECONDS >= deadline)); then
    "${compose[@]}" ps --all >&2 || true
    die "LobbyStack wasn't ready after $HEALTH_TIMEOUT_SECONDS seconds (admin: $admin_health, worker: $worker_health)." \
      "$logs_hint admin worker"
  fi
  sleep 3
done

if command -v curl >/dev/null 2>&1 && ! curl -fsS "$url/api/health/ready" >/dev/null 2>&1; then
  die "The containers are healthy, but $url doesn't answer from this machine." \
    "Check that nothing else listens on port $port, or set LOBBYSTACK_PORT and run the script again."
fi

cat <<EOF

${green}${bold}LobbyStack is running at $url${reset}

  1. Open $url and create your account.
  2. Your verification code arrives in Mailpit, which catches the stack's email: http://localhost:$mail_port
  3. Name your workspace and business. Skip the website and the phone number.
  4. On the dashboard, select ${bold}Hear your agent${reset} and allow the microphone.

Manage the stack from $install_dir:
  $manage ps
  $manage logs -f admin worker
  $manage down          # stops it and keeps your data
  Your settings and secrets are in $env_file.

Phone numbers need a public HTTPS address and a carrier (Twilio or Telnyx):
https://docs.lobbystack.com/self-hosting/quickstart#add-a-phone-number
EOF
