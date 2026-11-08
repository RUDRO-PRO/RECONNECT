// Local-only fixture: never reads or writes the configured Atlas database.
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const fromBackend = createRequire(path.resolve(__dirname, '../backend/package.json'));
const mongoose = fromBackend('mongoose'), jwt = fromBackend('jsonwebtoken');
const { MongoMemoryReplSet } = fromBackend('mongodb-memory-server');
const { createApp, initializeSchema, databaseOptions } = require('../backend/server');
const { publicCache } = require('../backend/utils/readCache');
const User = require('../backend/models/User'), Profile = require('../backend/models/Profile'), Invitation = require('../backend/models/Invitation'), DirectMessage = require('../backend/models/DirectMessage'), Notification = require('../backend/models/Notification'), Community = require('../backend/models/Community'), Team = require('../backend/models/Team');
async function main() {
  let replica, server, temp;
  try {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replica.getUri(), { ...databaseOptions, monitorCommands: true });
    const users = Array.from({ length: 300 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), name: `Builder ${i}`, email: `builder${i}@load.example`, authProvider: 'local', isVerified: true, tokenVersion: 0 }));
    await User.insertMany(users);
    await Profile.insertMany(users.map((u, i) => ({ userId: u._id, fullName: u.name, headline: 'Full stack developer', skills: [{ name: i % 2 ? 'React' : 'Node.js' }], interests: ['Climate'], college: { institution: `Institute ${i % 10}` }, hackathonAvailability: { available: true }, projects: [{ title: 'Working prototype', description: 'A seeded project for load testing.' }] })));
    const invitations = [], messages = [], notices = [];
    for (let i = 0; i < 50; i++) for (let j = 50; j < 60; j++) {
      const pairKey = [String(users[i]._id), String(users[j]._id)].sort().join(':');
      const invitationId = new mongoose.Types.ObjectId();
      invitations.push({ _id: invitationId, senderId: users[i]._id, receiverId: users[j]._id, pairKey, status: 'accepted' });
      notices.push({ senderId: users[j]._id, recipientId: users[i]._id, invitationId, type: 'accepted', read: false });
      for (let m = 0; m < 10; m++) messages.push({ conversationKey: pairKey, senderId: users[j]._id, recipientId: users[i]._id, text: `Planning update ${m}: prepare the demo and test the design.`, createdAt: new Date(Date.now() - (10 - m) * 1000), read: m < 7 });
    }
    await Invitation.insertMany(invitations); await DirectMessage.insertMany(messages); await Notification.insertMany(notices);
    await Community.insertMany(Array.from({ length: 45 }, (_, i) => ({ name: `Community ${i}`, creatorId: users[i]._id, members: [users[i]._id], tags: ['React'], inviteCode: `loadcode${String(i).padStart(4, '0')}` })));
    await Team.insertMany(Array.from({ length: 35 }, (_, i) => ({ ownerId: users[i]._id, name: `Team ${i}`, event: 'Load hackathon', description: 'Seeded team', openSlots: 3 })));
    await initializeSchema(); publicCache.clear();
    const secret = 'local-load-test-secret-isolated-from-production-2026';
    const tokens = users.slice(0, 50).map(u => jwt.sign({ userId: String(u._id), version: 0 }, secret, { subject: String(u._id), expiresIn: '1h', issuer: 'reconnect', audience: 'reconnect-web', algorithm: 'HS256' }));
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'reconnect-load-'));
    const tokenFile = path.join(temp, 'sessions.json'); await fs.writeFile(tokenFile, JSON.stringify(tokens));
    const commands = {}; let enabled = true, connectionsCreated = 0;
    mongoose.connection.getClient().on('commandStarted', event => {
      if (!enabled || !['find', 'aggregate', 'count', 'getMore', 'ping'].includes(event.commandName)) return;
      const key = `${event.commandName}:${event.command[event.commandName] || ''}`; commands[key] = (commands[key] || 0) + 1;
    });
    mongoose.connection.getClient().on('connectionCreated', () => { connectionsCreated++; });
    server = createApp({ secret, clientId: '', matchProviders: [], serveFrontend: false }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const output = path.resolve(__dirname, 'load-test-results.json');
    const child = spawn(process.execPath, [path.join(__dirname, 'load-test.mjs'), `http://127.0.0.1:${server.address().port}`], { windowsHide: true, env: { ...process.env, LOAD_TEST_TOKENS_FILE: tokenFile, LOAD_TEST_OUTPUT: output, LOAD_TEST_ROUNDS: '5' }, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    enabled = false;
    const report = JSON.parse(await fs.readFile(output, 'utf8'));
    const explain = await Profile.find().sort({ createdAt: -1, _id: -1 }).limit(30).explain('executionStats');
    const searchExplain = await Profile.find({ searchTokens: 'react' }).sort({ createdAt: -1 }).limit(30).explain('executionStats');
    const conversationExplain = await DirectMessage.aggregate([
      { $match: { conversationKey: { $in: invitations.slice(0, 10).map(i => i.pairKey) } } },
      { $sort: { conversationKey: 1, createdAt: -1, _id: -1 } },
      { $group: { _id: '$conversationKey', text: { $first: '$text' }, createdAt: { $first: '$createdAt' } } },
    ]).explain('executionStats');
    report.environment = { database: 'Disposable local MongoDB replica set (not Atlas M0)', users: 300, profiles: 300, acceptedConnections: invitations.length, directMessages: messages.length, communities: 45, teams: 35, pool: databaseOptions, warmProcess: true };
    report.databaseCommands = commands; report.serverPublicCache = { ...publicCache.stats }; report.additionalPoolConnectionsDuringRun = connectionsCreated;
    report.queryPlans = { discovery: { collectionScan: JSON.stringify(explain.queryPlanner.winningPlan).includes('COLLSCAN'), documentsExamined: explain.executionStats.totalDocsExamined, returned: explain.executionStats.nReturned }, prefixSearch: { collectionScan: JSON.stringify(searchExplain.queryPlanner.winningPlan).includes('COLLSCAN'), documentsExamined: searchExplain.executionStats.totalDocsExamined, returned: searchExplain.executionStats.nReturned } };
    report.queryPlans.conversationLatest = { collectionScan: JSON.stringify(conversationExplain).includes('COLLSCAN'), distinctScan: JSON.stringify(conversationExplain).includes('DISTINCT_SCAN') };
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log('Database command counts:', JSON.stringify(commands)); console.log('Server cache:', JSON.stringify(report.serverPublicCache)); console.log('Query plans:', JSON.stringify(report.queryPlans));
    process.exitCode = code || 0;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); if (replica) await replica.stop();
    // Only this process's generated temp files; no recursive filesystem cleanup.
    if (temp) { await fs.unlink(path.join(temp, 'sessions.json')).catch(() => {}); await fs.rmdir(temp).catch(() => {}); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
