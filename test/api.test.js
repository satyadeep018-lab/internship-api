'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { createRepository } = require('../src/repository');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'internships-seed.json'), 'utf8')).internships;
let server;
let base;

test.before(async () => {
  const db = openDb(':memory:');
  createRepository(db).seedMany(seed);
  server = createApp(db, { logRequests: false }).listen(0);
  await new Promise((r) => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, url, body, raw) {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body))
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

const newRecord = { title: 'Testing Intern', domain: 'Full Stack Development', mode: 'Hybrid', location: 'Pune', skills: ['Jest', 'Node.js'], openings: 1 };

test('GET /api/internships returns the envelope with pagination', async () => {
  const r = await call('GET', '/api/internships');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'success');
  assert.equal(r.json.data.length, 5);
  assert.deepEqual(r.json.pagination, { page: 1, limit: 10, total: 5, totalPages: 1 });
  assert.equal(r.json.data[0].id, 'INT-101');
});

test('pagination: limit and page slice the results', async () => {
  const r = await call('GET', '/api/internships?limit=2&page=3');
  assert.equal(r.json.data.length, 1);
  assert.equal(r.json.pagination.totalPages, 3);
  const beyond = await call('GET', '/api/internships?limit=2&page=9');
  assert.equal(beyond.status, 200);
  assert.deepEqual(beyond.json.data, []);
});

test('filters: domain, mode, search and open combine', async () => {
  assert.equal((await call('GET', '/api/internships?domain=ui%2Fux')).json.pagination.total, 1);
  assert.equal((await call('GET', '/api/internships?mode=Remote')).json.pagination.total, 3);
  assert.equal((await call('GET', '/api/internships?q=sql')).json.pagination.total, 2);
  assert.equal((await call('GET', '/api/internships?q=sql&mode=Hybrid')).json.pagination.total, 1);
  assert.equal((await call('GET', '/api/internships?q=%25')).json.pagination.total, 0); // % is literal, not a wildcard
  assert.equal((await call('GET', '/api/internships?open=false')).json.pagination.total, 0);
});

test('invalid query values return 400 VALIDATION_ERROR', async () => {
  for (const url of ['?page=0', '?limit=1000', '?mode=Office', '?unknown=1']) {
    const r = await call('GET', '/api/internships' + url);
    assert.equal(r.status, 400, url);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  }
});

test('GET detail: 200 for known id, 404 for unknown', async () => {
  const ok = await call('GET', '/api/internships/INT-102');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.title, 'API Engineering Intern');
  assert.equal(ok.json.data.applications_open, true);
  const missing = await call('GET', '/api/internships/INT-999');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.status, 'error');
  assert.equal(missing.json.error.code, 'NOT_FOUND');
});

test('POST creates a record with 201, Location header and generated id', async () => {
  const r = await call('POST', '/api/internships', newRecord);
  assert.equal(r.status, 201);
  assert.equal(r.json.data.id, 'INT-106');
  assert.equal(r.headers.get('location'), '/api/internships/INT-106');
  assert.equal((await call('GET', '/api/internships/INT-106')).status, 200);
});

test('POST rejects invalid data, unknown fields, duplicate ids and bad JSON', async () => {
  const bad = await call('POST', '/api/internships', { title: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error.details.length >= 5);
  assert.equal((await call('POST', '/api/internships', { ...newRecord, extra: true })).status, 400);
  assert.equal((await call('POST', '/api/internships', { ...newRecord, id: 'INT-101' })).status, 409);
  const broken = await call('POST', '/api/internships', '{"title":', true);
  assert.equal(broken.status, 400);
  assert.equal(broken.json.error.code, 'INVALID_JSON');
  const empty = await fetch(base + '/api/internships', { method: 'POST' });
  assert.equal(empty.status, 400);
});

test('PUT replaces, PATCH updates part, both 404 for unknown ids', async () => {
  const put = await call('PUT', '/api/internships/INT-106', { ...newRecord, title: 'Replaced Intern', openings: 4 });
  assert.equal(put.status, 200);
  assert.equal(put.json.data.title, 'Replaced Intern');
  assert.equal((await call('PUT', '/api/internships/INT-106', { title: 'Only title' })).status, 400);
  const patch = await call('PATCH', '/api/internships/INT-106', { openings: 9, duration_weeks: 6 });
  assert.equal(patch.status, 200);
  assert.equal(patch.json.data.openings, 9);
  assert.equal(patch.json.data.duration_weeks, 6);
  assert.equal(patch.json.data.title, 'Replaced Intern');
  assert.equal((await call('PATCH', '/api/internships/INT-106', {})).status, 400);
  assert.equal((await call('PATCH', '/api/internships/INT-999', { openings: 1 })).status, 404);
  assert.equal((await call('PUT', '/api/internships/INT-999', newRecord)).status, 404);
});

test('DELETE removes a record, then it is gone', async () => {
  const del = await call('DELETE', '/api/internships/INT-106');
  assert.equal(del.status, 200);
  assert.deepEqual(del.json.data, { id: 'INT-106', deleted: true });
  assert.equal((await call('GET', '/api/internships/INT-106')).status, 404);
  assert.equal((await call('DELETE', '/api/internships/INT-106')).status, 404);
});

test('applications: valid, duplicate, invalid and closed cases', async () => {
  const url = '/api/internships/INT-101/applications';
  const ok = await call('POST', url, { name: 'Asha Rao', email: 'asha@example.com', portfolio_url: 'https://example.com' });
  assert.equal(ok.status, 201);
  assert.deepEqual(Object.keys(ok.json.data).sort(), ['created_at', 'id', 'internship_id']); // no applicant details echoed

  const dup = await call('POST', url, { name: 'Asha Rao', email: 'ASHA@example.com' });
  assert.equal(dup.status, 409);
  assert.equal((await call('POST', '/api/internships/INT-102/applications', { name: 'Asha Rao', email: 'asha@example.com' })).status, 201);

  assert.equal((await call('POST', url, { email: 'b@example.com' })).status, 400);
  assert.equal((await call('POST', url, { name: 'Bo', email: 'nope' })).status, 400);
  assert.equal((await call('POST', url, { name: 'Bo', email: 'b@example.com', portfolio_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', '/api/internships/INT-999/applications', { name: 'Bo', email: 'b@example.com' })).status, 404);

  await call('PATCH', '/api/internships/INT-103', { applications_open: false });
  const closed = await call('POST', '/api/internships/INT-103/applications', { name: 'Bo', email: 'b@example.com' });
  assert.equal(closed.status, 409);
});

test('unknown routes return a JSON 404', async () => {
  const r = await call('GET', '/api/nothing');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'NOT_FOUND');
});
