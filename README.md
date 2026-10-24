# Internship API

A REST API for student internship records, built with Node.js, Express and SQLite. It has full create, read, update and delete endpoints, input validation, pagination, filters, and an application endpoint that rejects bad names, emails, unsafe URLs and duplicates.

- **Repository:** https://github.com/satyadeep018-lab/internship-api
- **Stack:** Node.js 22.13+, Express 5, built-in `node:sqlite` (no native build step)

## Requirements

Node.js **22.13 or newer**. Check with `node --version`. Download from https://nodejs.org if needed.

## Setup (Git Bash)

```bash
npm install            # installs Express
npm run seed           # creates data/internships.db and loads the 5 seed records
npm start              # http://localhost:3000
```

Other commands:

| Command | What it does |
|---|---|
| `npm run db:reset` | Deletes the database file and seeds it again |
| `npm run dev` | Starts the server and restarts on file changes |
| `npm test` | Runs the automated tests (no running server needed) |

### Environment variables

Optional. Copy `.env.example` to `.env` to change them. There are no secrets in this project.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DB_PATH` | `data/internships.db` | SQLite file location |

## Schema and seed

- Schema: [`db/schema.sql`](db/schema.sql), applied automatically on start-up and by `npm run seed`
- Seed data: [`db/internships-seed.json`](db/internships-seed.json), the 5 supplied records with their IDs preserved (`INT-101` to `INT-105`). Seeding is safe to repeat; existing IDs are skipped.

### Data model

`internships`

| Field | Type | Rules |
|---|---|---|
| `id` | string | `INT-` plus 3 to 6 digits. Optional on create (auto-generated, e.g. `INT-106`) |
| `title` | string | 3 to 100 characters, required |
| `domain` | string | 2 to 60 characters, required |
| `mode` | string | `Remote`, `Hybrid` or `On-site`, required |
| `location` | string | 2 to 60 characters, required |
| `skills` | string[] | 1 to 10 items, each 1 to 40 characters, required |
| `openings` | integer | 0 to 1000, required |
| `duration_weeks` | integer or null | 1 to 52, optional (extra field, from the sample SQL file) |
| `applications_open` | boolean | optional, default `true` |
| `created_at`, `updated_at` | ISO timestamp | set by the server |

`applications` holds the applicant name, lower-cased email, optional portfolio URL and a unique `(internship_id, email)` pair. There is deliberately **no endpoint that lists applications**, so applicant records are never exposed.

## Response format

Success:

```json
{ "status": "success", "data": { }, "pagination": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 } }
```

`pagination` appears on the list endpoint only. Errors:

```json
{ "status": "error", "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid.",
  "details": [ { "field": "email", "message": "email must be a valid email address." } ] } }
```

## Endpoints

| Method and path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /health` | Liveness check | 200 | |
| `GET /api/internships` | List with pagination and filters | 200 | 400 |
| `GET /api/internships/:id` | One record | 200 | 404 |
| `POST /api/internships` | Create | 201 (+ `Location` header) | 400, 409 |
| `PUT /api/internships/:id` | Replace (all required fields; optional ones reset to defaults) | 200 | 400, 404 |
| `PATCH /api/internships/:id` | Update only the fields sent | 200 | 400, 404 |
| `DELETE /api/internships/:id` | Delete (also removes its applications) | 200 | 404 |
| `POST /api/internships/:id/applications` | Apply (body: `name`, `email`, optional `portfolio_url`) | 201 | 400, 404, 409 |

**List query parameters:** `page` (default 1), `limit` (1 to 50, default 10), `q` (searches title, domain, location and skills), `domain`, `mode`, `open` (`true` or `false`). Unknown parameters return 400.

**Status codes:** 400 invalid input or malformed JSON, 404 unknown record or route, 409 conflict (duplicate id, duplicate application, applications closed), 413 body over 10 KB, 500 unexpected error with no internal detail.

**Delete returns 200 with a body** (`{"data":{"id":"INT-106","deleted":true}}`) instead of 204, so every response keeps the same envelope.

## Validation and safety

- Names, titles and other text are trimmed and checked for length and control characters
- Emails must look valid and are stored in lower case, so `A@x.com` and `a@x.com` are the same applicant
- Portfolio links must be `http` or `https` with no embedded username or password. `javascript:`, `data:` and `file:` links are rejected
- Unknown fields are rejected, not ignored
- Every SQL value is a bound parameter; `%` and `_` in search text are treated literally
- **Logging:** the server logs only `METHOD /path status time` (no query strings, headers or bodies). Errors log the error name and code only. No passwords or tokens exist in this app, and applicant data is never logged or echoed back.

## Try it

With the server running, in a second Git Bash window:

```bash
bash requests/api-examples.sh
```

Single examples:

```bash
curl -s 'http://localhost:3000/api/internships?limit=2&page=1'
curl -s 'http://localhost:3000/api/internships?mode=Remote&q=sql'
curl -s -X POST http://localhost:3000/api/internships -H 'Content-Type: application/json' \
  -d '{"title":"Testing Intern","domain":"Full Stack Development","mode":"Hybrid","location":"Pune","skills":["Jest"],"openings":1}'
curl -s -X POST http://localhost:3000/api/internships/INT-101/applications -H 'Content-Type: application/json' \
  -d '{"name":"Asha Rao","email":"asha@example.com","portfolio_url":"https://example.com"}'
```

## Project structure

```
src/app.js          routes, error handling, logging
src/validation.js   input rules
src/repository.js   all SQL
src/db.js           opens SQLite and applies the schema
src/seed.js         seed / reset command
src/server.js       starts the server
db/schema.sql  db/internships-seed.json
test/               validation and API tests (node:test)
requests/api-examples.sh
```

## Limits (stated honestly)

- No authentication: anyone who can reach the API can create, change or delete records. Fine for a practice project, not for production.
- SQLite stores data in a local file. Hosts with read-only or temporary disks (such as Vercel serverless functions) will not keep it; use a host with a persistent disk, or switch to PostgreSQL, for a public deployment.
- Duplicate checks and validation are enforced by the server and by database constraints.

## Test results

Run `npm test` and paste the summary here (look for `pass` and `fail` counts).

```
Node v24.22.1, Express 5: tests 18, pass 18, fail 0
```
