'use strict';

const express = require('express');
const { ApiError, ValidationError } = require('./errors');
const { createRepository } = require('./repository');
const { validateInternship, validateApplication, validateListQuery } = require('./validation');

const success = (data, extra) => ({ status: 'success', data, ...extra });
const failure = (code, message, details) => ({ status: 'error', error: { code, message, ...(details ? { details } : {}) } });

// Logs method, path, status and timing only. Never bodies, query strings or headers.
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`));
  next();
}

function createApp(db, { logRequests = true } = {}) {
  const repo = createRepository(db);
  const app = express();
  app.disable('x-powered-by');
  if (logRequests) app.use(requestLogger);
  app.use(express.json({ limit: '10kb' }));

  const mustFind = (id) => {
    const found = repo.get(id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Internship not found.');
    return found;
  };
  const conflict = (message) => new ApiError(409, 'CONFLICT', message);

  app.get('/health', (req, res) => res.json(success({ ok: true })));

  app.get('/api/internships', (req, res) => {
    const query = validateListQuery(req.query);
    const { rows, total } = repo.list(query);
    res.json(success(rows, {
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
    }));
  });

  app.get('/api/internships/:id', (req, res) => {
    res.json(success(mustFind(req.params.id)));
  });

  app.post('/api/internships', (req, res) => {
    const data = validateInternship(req.body ?? null, { allowId: true });
    if (data.id && repo.get(data.id)) throw conflict(`An internship with id ${data.id} already exists.`);
    let created;
    try {
      created = repo.create(data);
    } catch (e) {
      if (repo.isUniqueViolation(e)) throw conflict('An internship with that id already exists.');
      throw e;
    }
    res.status(201).location(`/api/internships/${created.id}`).json(success(created));
  });

  // PUT replaces the record: all required fields must be sent; optional ones reset to defaults.
  app.put('/api/internships/:id', (req, res) => {
    mustFind(req.params.id);
    const data = validateInternship(req.body ?? null);
    const full = { applications_open: true, duration_weeks: null, ...data };
    res.json(success(repo.update(req.params.id, full)));
  });

  // PATCH changes only the fields that are sent.
  app.patch('/api/internships/:id', (req, res) => {
    mustFind(req.params.id);
    const data = validateInternship(req.body ?? null, { partial: true });
    res.json(success(repo.update(req.params.id, data)));
  });

  app.delete('/api/internships/:id', (req, res) => {
    mustFind(req.params.id);
    repo.remove(req.params.id);
    res.json(success({ id: req.params.id, deleted: true }));
  });

  app.post('/api/internships/:id/applications', (req, res) => {
    const internship = mustFind(req.params.id);
    const data = validateApplication(req.body ?? null);
    if (!internship.applications_open) throw conflict('Applications are closed for this internship.');
    if (repo.hasApplied(internship.id, data.email)) throw conflict('This email has already applied to this internship.');
    let application;
    try {
      application = repo.addApplication(internship.id, data);
    } catch (e) {
      if (repo.isUniqueViolation(e)) throw conflict('This email has already applied to this internship.');
      throw e;
    }
    res.status(201).json(success(application)); // no applicant details in the response
  });

  app.use((req, res) => {
    res.status(404).json(failure('NOT_FOUND', 'Route not found.'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json(failure('VALIDATION_ERROR', 'Some fields are invalid.', err.details));
    if (err instanceof ApiError) return res.status(err.status).json(failure(err.code, err.message));
    if (err.type === 'entity.parse.failed') return res.status(400).json(failure('INVALID_JSON', 'The request body is not valid JSON.'));
    if (err.type === 'entity.too.large') return res.status(413).json(failure('PAYLOAD_TOO_LARGE', 'The request body is too large.'));
    console.error('Unhandled error:', err.name, err.code || ''); // name and code only, no body or stack
    return res.status(500).json(failure('INTERNAL_ERROR', 'Something went wrong.'));
  });

  return app;
}

module.exports = { createApp };
