'use strict';

const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'internships.db');

const db = openDb(DB_PATH);
if (db.prepare('SELECT COUNT(*) AS n FROM internships').get().n === 0) {
  console.log('The database is empty. Run "npm run seed" to load the sample records.');
}

const server = createApp(db).listen(PORT, () => {
  console.log(`Internship API listening on http://localhost:${PORT}`);
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set a different PORT.` : `Server error: ${e.code || e.name}`);
  process.exit(1);
});
