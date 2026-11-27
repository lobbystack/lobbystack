#!/usr/bin/env bash
# Checks that a public image holds none of a deployment's settings, so anyone
# can run it: its environment sets only the runtime defaults from its
# Dockerfile, and the admin's build has no PostHog or Turnstile key, no outside
# link, and no marketing site written into it.
#
# Usage: scripts/verify-public-image.sh <admin|worker|migrator> <image>
set -euo pipefail

service="${1:?Pass the service: admin, worker or migrator}"
image="${2:?Pass the image to check}"
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# The Dockerfiles set these and nothing else.
allowed_env='^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|PORT|HOSTNAME|SERVICE_VERSION)='
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  if [[ ! "$entry" =~ $allowed_env ]]; then fail "$image sets ${entry%%=*} in its environment."; fi
done < <(docker image inspect "$image" --format '{{range .Config.Env}}{{println .}}{{end}}')

if [[ "$service" == "admin" ]]; then
  # PostHog project and personal keys, and Cloudflare Turnstile site keys.
  matches="$(docker run --rm --entrypoint sh "$image" -c \
    'grep -rlE "phc_[A-Za-z0-9]{20,}|phx_[A-Za-z0-9]{20,}|0x4AAAAAAA[A-Za-z0-9_-]{6,}" apps/admin/.next apps/admin/public 2>/dev/null | head -5' || true)"
  [[ -n "$matches" ]] && fail "the admin build holds an analytics or Turnstile key: $matches"

  # next.config.ts writes these into the build. A public image leaves each one
  # empty, so the dashboard links to LobbyStack's site and docs and starts no
  # analytics, and it leaves the marketing site out.
  baked="$(docker run --rm --entrypoint node "$image" -e '
    const env = require("/app/apps/admin/.next/required-server-files.json").config.env ?? {};
    const runtime = new Set(["NEXT_PUBLIC_SERVICE_VERSION", "NEXT_PUBLIC_ASSET_VERSION", "NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT", "MARKETING_SITE_BUILT"]);
    const set = Object.entries(env).filter(([name, value]) => !runtime.has(name) && value !== "").map(([name]) => name);
    if (env.MARKETING_SITE_BUILT !== "false") set.push("MARKETING_SITE_BUILT");
    console.log(set.join(" "));
  ')"
  [[ -n "$baked" ]] && fail "the admin build has these set: $baked"
fi

if ((failures > 0)); then
  echo "$image is not a public image: $failures problem(s)." >&2
  exit 1
fi
echo "$image holds no deployment settings."
