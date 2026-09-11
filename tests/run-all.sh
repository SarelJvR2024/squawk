#!/usr/bin/env bash
#
# Every suite, once, with the servers each one needs.
#
# Until this existed, the only record of how to run the 42 suites was prose
# spread over 900 lines of tests/README.md — which port, which env vars, which
# ones start their own server. That is fine for running one suite and useless
# for running all of them, and it is why three of the browser rows in that
# README's table had drifted from what the suites actually assert without
# anybody noticing. The counts this prints are MEASURED. Paste them into the
# table; never type a number in from memory.
#
#   bash tests/run-all.sh              source suites, then browser suites
#   bash tests/run-all.sh --source     source suites only (no build, seconds)
#   bash tests/run-all.sh --no-build   browser suites against the existing .next
#
# NEVER rebuild .next while a browser suite is running against it — the suite
# starts failing on half-written chunks and the failures look like real ones.
# That is why the build happens here, before anything is started.

set -uo pipefail
cd "$(dirname "$0")/.."

PLAIN_PORT=3200   # no keys at all: BASE for most suites, and ai.js's BASE_NO_KEY
KEYED_PORT=3201   # placeholder keys: ai.js's BASE_WITH_KEY

SOURCE_ONLY=0; BUILD=1
for a in "$@"; do
  case "$a" in
    --source) SOURCE_ONLY=1 ;;
    --no-build) BUILD=0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

fails=0
rows=""
row() { rows="${rows}$(printf '%-22s %6s\n' "$1" "$2")
"; }

# ---------------------------------------------------------------- source ----
# Three read files through the "@/..." alias and need the loader to resolve it.
echo "== source suites"
for f in tests/*.test.mjs; do
  case "$f" in
    *sharepoint*|*merge*|*figures*) args="--import ./tests/alias.mjs" ;;
    *) args="" ;;
  esac
  out=$(node $args "$f" 2>&1)
  if [ $? -ne 0 ]; then
    fails=$((fails+1)); echo "FAIL $f"; echo "$out" | grep -i "^FAIL" | head -6
    row "$(basename "$f")" "FAIL"
  else
    n=$(printf '%s\n' "$out" | grep -c "^PASS")
    [ "$n" -eq 0 ] && n="ok"
    row "$(basename "$f")" "$n"
  fi
done
[ "$SOURCE_ONLY" -eq 1 ] && { printf '%s' "$rows"; echo "source suites: $fails failed"; exit $((fails ? 1 : 0)); }

# --------------------------------------------------------------- servers ----
if [ "$BUILD" -eq 1 ]; then
  echo "== build"
  npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }
fi

# `pkill -f next-server` matches this script's own process tree and takes the
# shell down with it (exit 144). Kill by pid, from a pattern that cannot match
# the grep itself.
stop_servers() {
  pids=$(ps -eo pid,args | grep "[n]ext-server" | awk '{print $1}')
  [ -n "$pids" ] && kill $pids 2>/dev/null
  return 0
}
trap stop_servers EXIT

wait_up() {
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$1/api/sync" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "server on $1 never came up" >&2; return 1
}

echo "== servers"
stop_servers; sleep 1
( ANTHROPIC_API_KEY= ELEVENLABS_API_KEY= npx next start -p "$PLAIN_PORT" >/tmp/squawk-$PLAIN_PORT.log 2>&1 & )
# Neither key has to be valid. Invalid ones exercise the failure paths, which
# are the branches worth testing; the transcription SUCCESS path needs a real
# key and is the one thing here that has never run.
( ANTHROPIC_API_KEY=sk-ant-placeholder ELEVENLABS_API_KEY=el-placeholder \
    npx next start -p "$KEYED_PORT" >/tmp/squawk-$KEYED_PORT.log 2>&1 & )
wait_up "$PLAIN_PORT" || exit 1
wait_up "$KEYED_PORT" || exit 1

# --------------------------------------------------------------- browser ----
# shared.js, vision.js and record.js start (and stop) everything they need,
# including a fake Supabase; passing BASE to them is harmless.
echo "== browser suites"
BASE_URL="http://127.0.0.1:$PLAIN_PORT"
for t in e2e robustness exports persite vision record flow offline team preflight shared a11y; do
  out=$(BASE="$BASE_URL" node "tests/$t.js" 2>&1)
  code=$?
  n=$(printf '%s\n' "$out" | grep -c "^PASS")
  if [ $code -ne 0 ]; then
    fails=$((fails+1)); echo "FAIL tests/$t.js"; echo "$out" | grep "^FAIL" | head -6
    row "$t.js" "FAIL"
  else
    row "$t.js" "$n"
  fi
done

# ai.js is the only one needing TWO deployments at once — one with no model
# configured and one with a model that will fail — because what it is really
# testing is that the app is honest about which it is talking to.
out=$(BASE_NO_KEY="http://127.0.0.1:$PLAIN_PORT" BASE_WITH_KEY="http://127.0.0.1:$KEYED_PORT" \
      node tests/ai.js 2>&1)
code=$?
n=$(printf '%s\n' "$out" | grep -c "^PASS")
if [ $code -ne 0 ]; then
  fails=$((fails+1)); echo "FAIL tests/ai.js"; echo "$out" | grep "^FAIL" | head -6
  row "ai.js" "FAIL"
else
  row "ai.js" "$n"
fi

# ----------------------------------------------------------------- report ----
echo
printf '%s' "$rows"
total=$(printf '%s' "$rows" | awk '$2 ~ /^[0-9]+$/ { s += $2 } END { print s+0 }')
echo
echo "$(printf '%s' "$rows" | grep -c .) suites, $total assertions, $fails suites failed"
exit $((fails ? 1 : 0))
