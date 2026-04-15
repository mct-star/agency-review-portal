#!/usr/bin/env bash
# API smoke test — hits key endpoints to catch 5xx and Gemini-fallback regressions.
# Reads creds from .env.local, writes results to sweep-results/<run>/api-smoke.log.

set -uo pipefail

# Load .env.local
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

BASE_URL="${TEST_BASE_URL:-https://agency-review-portal.vercel.app}"
RUN_ID="${SWEEP_RUN_ID:-$(date -u +%Y%m%d%H)}"
OUT_DIR="sweep-results/${RUN_ID}"
LOG="${OUT_DIR}/api-smoke.log"

mkdir -p "${OUT_DIR}"
: > "${LOG}"

log() {
  echo "$1" | tee -a "${LOG}"
}

log "=== API Smoke Test ==="
log "Base URL: ${BASE_URL}"
log "Run ID: ${RUN_ID}"
log "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log ""

# Auth: use storageState cookies from Playwright
AUTH_FILE="tests/.auth/admin.json"
if [ ! -f "${AUTH_FILE}" ]; then
  log "WARN: ${AUTH_FILE} not found. Run 'npm run test:smoke' first to generate auth state."
  log "Running unauthenticated smoke tests only."
  COOKIE_HEADER=""
else
  # Extract cookies from Playwright storageState JSON
  COOKIE_STRING=$(node -e "
    const s = require('./${AUTH_FILE}');
    console.log(s.cookies.map(c => c.name + '=' + c.value).join('; '));
  ")
  COOKIE_HEADER="Cookie: ${COOKIE_STRING}"
fi

BYPASS_HEADER=""
if [ -n "${VERCEL_BYPASS_TOKEN:-}" ]; then
  BYPASS_HEADER="x-vercel-protection-bypass: ${VERCEL_BYPASS_TOKEN}"
fi

FAILS=0

check_endpoint() {
  local METHOD="$1"
  local ENDPOINT="$2"
  local BODY="$3"
  local EXPECT_MIN_STATUS="${4:-200}"
  local EXPECT_MAX_STATUS="${5:-299}"
  local CHECK_BODY="${6:-}"

  local URL="${BASE_URL}${ENDPOINT}"
  log "--- ${METHOD} ${ENDPOINT}"

  local HEADERS=(-H "Content-Type: application/json")
  [ -n "${COOKIE_HEADER}" ] && HEADERS+=(-H "${COOKIE_HEADER}")
  [ -n "${BYPASS_HEADER}" ] && HEADERS+=(-H "${BYPASS_HEADER}")

  local TMP_BODY
  TMP_BODY=$(mktemp)

  local STATUS
  if [ "${METHOD}" = "POST" ]; then
    STATUS=$(curl -sS -o "${TMP_BODY}" -w "%{http_code}" -X POST "${URL}" "${HEADERS[@]}" -d "${BODY}" || echo "000")
  else
    STATUS=$(curl -sS -o "${TMP_BODY}" -w "%{http_code}" "${URL}" "${HEADERS[@]}" || echo "000")
  fi

  log "  Status: ${STATUS}"

  if [ "${STATUS}" -lt "${EXPECT_MIN_STATUS}" ] || [ "${STATUS}" -gt "${EXPECT_MAX_STATUS}" ]; then
    log "  FAIL: expected ${EXPECT_MIN_STATUS}-${EXPECT_MAX_STATUS}"
    log "  Body: $(head -c 500 "${TMP_BODY}")"
    FAILS=$((FAILS + 1))
  else
    log "  OK"
    if [ -n "${CHECK_BODY}" ]; then
      local BODY_CONTENT
      BODY_CONTENT=$(cat "${TMP_BODY}")
      local BODY_LEN=${#BODY_CONTENT}
      log "  Body length: ${BODY_LEN} bytes"
      if [ "${BODY_LEN}" -lt 100 ]; then
        log "  FAIL: body too short (< 100 bytes) — suspect empty response"
        FAILS=$((FAILS + 1))
      fi
    fi
  fi

  rm -f "${TMP_BODY}"
  log ""
}

# --- Health checks (unauthenticated) ---
# Accept 2xx or 3xx — marketing routes redirect when logged out
check_endpoint "GET" "/" "" 200 399
check_endpoint "GET" "/login" "" 200 399
check_endpoint "GET" "/signup" "" 200 299

# --- Authenticated endpoints ---
if [ -n "${COOKIE_HEADER}" ]; then
  check_endpoint "GET" "/api/me" "" 200 299
  check_endpoint "GET" "/api/companies" "" 200 299

  # Look up the test user's company ID for the generate payload
  COMPANY_ID=$(curl -sS "${BASE_URL}/api/companies" \
    -H "${COOKIE_HEADER}" \
    ${BYPASS_HEADER:+-H "${BYPASS_HEADER}"} \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const arr=j.data||j.companies||j||[];console.log(arr[0]?.id||'')}catch{console.log('')}})")
  log "Resolved test company ID: ${COMPANY_ID:-<none>}"

  if [ -n "${COMPANY_ID}" ]; then
    # The big one: Gemini fallback regression catch
    # Correct field names per src/app/api/generate/quick/route.ts
    GEN_PAYLOAD="{\"companyId\":\"${COMPANY_ID}\",\"topic\":\"smoke test topic\",\"postTypeSlug\":\"insight\",\"platform\":\"linkedin\"}"
    check_endpoint "POST" "/api/generate/quick" "${GEN_PAYLOAD}" 200 299 "check_length"
  else
    log "SKIP: could not resolve company ID; skipping /api/generate/quick test"
  fi
fi

log "=== Summary ==="
log "Failures: ${FAILS}"

if [ "${FAILS}" -gt 0 ]; then
  exit 1
fi
exit 0
