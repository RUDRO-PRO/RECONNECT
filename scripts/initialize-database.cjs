// Explicit, idempotent deployment migration. No index builds on function cold starts.
const { initializeDatabase, initializeSchema } = require('../backend/server');
const mongoose = require(require.resolve('mongoose', { paths: [require('node:path').resolve(__dirname, '../backend')] }));
(async () => { try { await initializeDatabase(); await initializeSchema(); console.log('Indexes, search fields and legacy accounts initialized.'); } finally { await mongoose.disconnect(); } })().catch(error => { console.error(error.name + ': schema initialization failed; inspect database access.'); process.exitCode = 1; });
