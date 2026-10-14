#!/usr/bin/env bash
# Builds the admin, worker and migrator images for one commit and pushes them to
# Docker Hub, tagged with the short commit and `latest`. The self-hosted Railway
# template (.railway/template.ts) deploys these images.
#
# Usage: scripts/publish-images.sh [ref] [namespace]    (default: origin/main morencyr)
# Run `docker login` first.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$ROOT" rev-parse "${1:-origin/main}")"
NAMESPACE="${2:-morencyr}"
WORK="$(mktemp -d)/publish-images"
trap 'git -C "$ROOT" worktree remove --force "$WORK" >/dev/null 2>&1 || true' EXIT

git -C "$ROOT" worktree add --detach "$WORK" "$SHA" >/dev/null
cd "$WORK"
for service in migrator worker admin; do
  echo "==> $service"
  # Railway runs linux/amd64. The admin reads its storage and security-header settings at
  # runtime, so one image serves every deployment.
  docker buildx build --platform linux/amd64 --push -f "Dockerfile.$service" --build-arg "SERVICE_VERSION=$SHA" \
    -t "$NAMESPACE/lobbystack-$service:${SHA:0:8}" -t "$NAMESPACE/lobbystack-$service:latest" .
done
echo "Published ${SHA:0:8} to $NAMESPACE/lobbystack-{migrator,worker,admin}."
