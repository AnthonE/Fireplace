#!/bin/sh
# Which Claude this run uses, for elo-plan.yml. The repo's own key or Claude
# subscription when one is set; otherwise Elo Pros credits, paid by the Elo
# Pros account whose GitHub login owns this repo: GitHub's OIDC token for this
# job (the workflow's id-token: write) is traded for a run key, and Claude Code
# talks to Elo Pros, which forwards each call to Anthropic and charges it by
# the token. With neither, say how to set one up on the issue ($1) and stop.
set -u
if [ -n "${KEY:-}${TOKEN:-}" ]; then
  echo "ok=1" >> "$GITHUB_OUTPUT"
  exit 0
fi
why="no Claude key in this repo"
if [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  oidc=$(curl -sfS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=elopros" | jq -r '.value // empty')
  if [ -n "$oidc" ]; then
    got=$(jq -n --arg t "$oidc" '{token: $t}' | curl -sS -X POST -H 'content-type: application/json' \
      --data-binary @- "$ELO_API/claude/session" || true)
    key=$(printf '%s' "$got" | jq -r '.key // empty' 2>/dev/null)
    if [ -n "$key" ]; then
      echo "::add-mask::$key"
      echo "key=$key" >> "$GITHUB_OUTPUT"
      echo "ok=1" >> "$GITHUB_OUTPUT"
      echo "ANTHROPIC_BASE_URL=$ELO_API/claude" >> "$GITHUB_ENV"
      echo "ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-5-5" >> "$GITHUB_ENV"
      echo "Claude runs on Elo Pros credits for $GITHUB_REPOSITORY"
      exit 0
    fi
    why=$(printf '%s' "$got" | jq -r '.error.message // empty' 2>/dev/null)
    [ -n "$why" ] || why="Elo Pros did not answer"
  fi
fi
echo "ok=0" >> "$GITHUB_OUTPUT"
{ printf 'Elo Pros credits: %s.\n\n' "$why"; cat .github/elo/no-secret.md; } > "$RUNNER_TEMP/no-secret.md"
gh issue comment "$1" --body-file "$RUNNER_TEMP/no-secret.md"
