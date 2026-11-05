#!/usr/bin/env bash
#
# Start Aura Mirror on Raspberry Pi OS and open it full screen on this desktop.
# Run it from a terminal inside the signed-in graphical session.
#
#   bash pi/launch-mirror.sh           Start the server if needed, open kiosk mode
#   bash pi/launch-mirror.sh --check   Report readiness only; starts nothing, writes nothing
#   bash pi/launch-mirror.sh --help
#
# Environment:
#   PORT=8787                Loopback port. Overrides PORT in .env.
#   AURA_BROWSER_MODE=kiosk  Or "app" for a window with reachable site settings.
#   AURA_HEALTH_TIMEOUT=45   Seconds to wait for the server to become healthy.
#
# Installs nothing, changes no system settings, grants no browser permissions and
# never reads .env (Node loads it). It only stops a server that it started itself.

set -euo pipefail

say() { printf 'aura: %s\n' "$*"; }
warn() { printf 'aura: warning: %s\n' "$*" >&2; }
die() { printf 'aura: error: %s\n' "$*" >&2; exit 1; }

check_only=false
case "${1:-}" in
  '') ;;
  --check) check_only=true ;;
  -h | --help) sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) die "unknown option '$1'. Try --help." ;;
esac
[[ $# -le 1 ]] || die 'expected at most one option. Try --help.'

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$project_dir"

port=${PORT:-8787}
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) \
  || die "PORT must be a number from 1024 to 65535 (got '$port')."
port=$((10#$port))

health_timeout=${AURA_HEALTH_TIMEOUT:-45}
[[ "$health_timeout" =~ ^[0-9]{1,3}$ ]] && ((10#$health_timeout >= 1)) \
  || die "AURA_HEALTH_TIMEOUT must be 1 to 999 seconds (got '$health_timeout')."
health_timeout=$((10#$health_timeout))

browser_mode=${AURA_BROWSER_MODE:-kiosk}
[[ "$browser_mode" == kiosk || "$browser_mode" == app ]] \
  || die "AURA_BROWSER_MODE must be kiosk or app (got '$browser_mode')."

# Preflight -------------------------------------------------------------------

((EUID != 0)) || die 'run this as your desktop user, not root or sudo.'
[[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] \
  || die 'no graphical session found. Run this from a terminal on the Pi desktop, not plain SSH.'

command -v node >/dev/null 2>&1 || die 'Node.js 22+ was not found on PATH. See pi/README.md.'
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' \
  || die "Node.js 22.12+ is required. Found $(node -v). See pi/README.md."
node_target=$(node -p 'process.platform + "-" + process.arch')
[[ "$node_target" == linux-arm64 ]] \
  || warn "Node reports $node_target; this deployment was written for linux-arm64."

browser=''
for candidate in chromium chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    browser=$candidate
    break
  fi
done
[[ -n "$browser" ]] || die 'chromium or chromium-browser was not found. This script does not install it.'

[[ -f server/index.mjs ]] || die "server/index.mjs is missing from $project_dir."

# Aura's health route only says {ok:true}, so identity also needs its config shape
# and page title. Exit codes: 0 Aura, 1 port free, 2 something else or unresponsive,
# 3 Aura, but it rejects this page's origin (browser writes would fail with HTTP 403).
probe_result=0
probe() {
  probe_result=0
  node --input-type=module - "$port" >/dev/null 2>&1 <<'JS' || probe_result=$?
async function probeAura(port) {
  const get = (path, headers = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    headers, redirect: "manual", signal: AbortSignal.timeout(2500),
  });
  let health;
  try {
    health = await get("/api/health");
  } catch (error) {
    return error?.cause?.code === "ECONNREFUSED" ? 1 : 2;
  }
  try {
    if ((await health.json())?.ok !== true) return 2;
    const config = await (await get("/api/config")).json();
    if (typeof config?.gestures?.poseModelUrl !== "string") return 2;
    if (!/<title>\s*Aura\b/.test(await (await get("/")).text())) return 2;
    const withOrigin = await get("/api/health", { Origin: `http://localhost:${port}` });
    await withOrigin.arrayBuffer();
    return withOrigin.status === 403 ? 3 : withOrigin.ok ? 0 : 2;
  } catch {
    return 2;
  }
}
process.exitCode = await probeAura(process.argv[2]);
JS
}

origin_help="ALLOWED_ORIGINS must include http://localhost:$port. Edit your .env or set it in this shell, then restart the server."

probe
case "$probe_result" in
  0 | 1) ;;
  3) die "Aura is running on port $port but rejects the browser's origin. $origin_help" ;;
  *) die "port $port is used by something else, or it is not responding. Nothing was stopped. Try: PORT=8788 bash pi/launch-mirror.sh" ;;
esac

# Only a new server needs the local build.
if ((probe_result == 1)); then
  [[ -f dist/index.html ]] || die 'dist/index.html is missing. Run: npm ci && npm run build'
  [[ -d node_modules/express ]] || die 'node_modules is incomplete. Run: npm ci'
  [[ -f public/models/hand_landmarker.task && -f public/models/pose_landmarker_lite.task ]] \
    || die 'local vision models are missing. Run: npm run prepare:models'
fi

if [[ "$check_only" == true ]]; then
  say "project:  $project_dir"
  say "node:     $(node -v) ($node_target)"
  say "browser:  $browser ($browser_mode mode)"
  if ((probe_result == 0)); then
    say "server:   Aura is already running on port $port"
  else
    say "server:   port $port is free; the launcher would start Aura"
  fi
  say 'Ready. Nothing was started.'
  exit 0
fi

# Launch ----------------------------------------------------------------------

state_dir=${XDG_STATE_HOME:-$HOME/.local/state}/aura-mirror
profile_dir=$state_dir/chromium-profile
server_log=$state_dir/server.log
browser_log=$state_dir/browser.log
(umask 077 && mkdir -p -- "$profile_dir" && : >"$server_log" && : >"$browser_log")

server_pid=''
cleanup() {
  set +e
  [[ -n "$server_pid" ]] || return 0
  if kill -0 "$server_pid" 2>/dev/null; then
    say 'Stopping the Aura server this launcher started.'
    kill -TERM "$server_pid" 2>/dev/null
    for _ in {1..50}; do
      kill -0 "$server_pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -0 "$server_pid" 2>/dev/null && kill -KILL "$server_pid" 2>/dev/null
  fi
  wait "$server_pid" 2>/dev/null
  server_pid=''
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if ((probe_result == 0)); then
  say "Aura is already running on port $port. Leaving that server alone."
else
  # Loopback is forced because this launcher only opens the local display. Node's
  # dotenv does not replace variables that are already set, so these beat .env.
  export HOST=127.0.0.1 PORT=$port
  if [[ $port -ne 8787 && -z "${ALLOWED_ORIGINS:-}" ]]; then
    export ALLOWED_ORIGINS="http://localhost:$port,http://127.0.0.1:$port"
  fi

  say "Starting Aura on port $port. Server log: $server_log"
  node server/index.mjs >>"$server_log" 2>&1 &
  server_pid=$!

  deadline=$((SECONDS + health_timeout))
  while :; do
    probe
    ((probe_result == 0)) && break
    ((probe_result == 3)) && die "Aura started but rejects the browser's origin. $origin_help"
    if ! kill -0 "$server_pid" 2>/dev/null; then
      tail -n 20 -- "$server_log" >&2 || true
      die "the server exited during startup. Full log: $server_log"
    fi
    if ((SECONDS >= deadline)); then
      tail -n 20 -- "$server_log" >&2 || true
      die "Aura was not healthy within ${health_timeout}s. Full log: $server_log"
    fi
    sleep 1
  done
  say 'Server is healthy.'
fi

url="http://localhost:$port/"
# The separate profile keeps camera and microphone decisions out of the everyday
# browser profile. Do not add flags here that auto-accept media permissions.
browser_args=(
  "--user-data-dir=$profile_dir"
  --no-first-run
  --no-default-browser-check
  --noerrdialogs
)
if [[ "$browser_mode" == kiosk ]]; then
  browser_args+=(--kiosk "$url")
else
  browser_args+=("--app=$url")
fi

say "Opening $url with $browser ($browser_mode mode)."
browser_started=$SECONDS
browser_status=0
"$browser" "${browser_args[@]}" >>"$browser_log" 2>&1 || browser_status=$?
browser_ran_for=$((SECONDS - browser_started))

if ((browser_status != 0)); then
  warn "$browser exited with status $browser_status. Browser log: $browser_log"
fi

# A wrapper script or an already-open profile can return immediately while a window
# stays open. Keep a server we own running rather than break that window.
if [[ -n "$server_pid" ]] && ((browser_status == 0 && browser_ran_for < 5)); then
  warn "$browser returned after ${browser_ran_for}s. If no window is open, see $browser_log"
  say 'Keeping the server running. Press Ctrl+C here to stop it.'
  wait "$server_pid" || true
  server_pid=''
fi

exit "$browser_status"
