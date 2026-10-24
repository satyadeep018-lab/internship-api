#!/usr/bin/env bash
# Usage (Git Bash): start the API in one terminal, then run: bash requests/api-examples.sh
BASE="${BASE:-http://localhost:3000}"
H='Content-Type: application/json'

echo '--- health';              curl -s "$BASE/health"; echo
echo '--- list (page 1, 2 per page)'; curl -s "$BASE/api/internships?limit=2&page=1"; echo
echo '--- filter: Remote + search sql'; curl -s "$BASE/api/internships?mode=Remote&q=sql"; echo
echo '--- detail';              curl -s "$BASE/api/internships/INT-101"; echo
echo '--- create (201)';        curl -s -i -X POST "$BASE/api/internships" -H "$H" \
  -d '{"title":"Testing Intern","domain":"Full Stack Development","mode":"Hybrid","location":"Pune","skills":["Jest","Node.js"],"openings":1}'; echo
echo '--- create invalid (400)'; curl -s -X POST "$BASE/api/internships" -H "$H" -d '{"title":"x","mode":"Office"}'; echo
echo '--- patch';               curl -s -X PATCH "$BASE/api/internships/INT-106" -H "$H" -d '{"openings":5}'; echo
echo '--- put (replace)';       curl -s -X PUT "$BASE/api/internships/INT-106" -H "$H" \
  -d '{"title":"Replaced Intern","domain":"Full Stack Development","mode":"Remote","location":"India","skills":["Node.js"],"openings":2}'; echo
echo '--- delete';              curl -s -X DELETE "$BASE/api/internships/INT-106"; echo
echo '--- not found (404)';     curl -s "$BASE/api/internships/INT-999"; echo
echo '--- apply (201)';         curl -s -X POST "$BASE/api/internships/INT-101/applications" -H "$H" \
  -d '{"name":"Asha Rao","email":"asha@example.com","portfolio_url":"https://example.com"}'; echo
echo '--- apply again (409 duplicate)'; curl -s -X POST "$BASE/api/internships/INT-101/applications" -H "$H" \
  -d '{"name":"Asha Rao","email":"asha@example.com"}'; echo
echo '--- apply unsafe url (400)'; curl -s -X POST "$BASE/api/internships/INT-101/applications" -H "$H" \
  -d '{"name":"Asha Rao","email":"new@example.com","portfolio_url":"javascript:alert(1)"}'; echo
