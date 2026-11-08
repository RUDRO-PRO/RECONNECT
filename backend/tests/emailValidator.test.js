const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, validateEmailDomain } = require('../utils/emailValidator');
test('email syntax, disposable subdomains, null MX, DNS failures and timeouts', async () => {
  for (const email of ['a..b@gmail.com', '.a@gmail.com', 'a.@gmail.com', 'a@-mail.com', 'a@a..com', 'a b@gmail.com', 'a@localhost', 'a@@gmail.com']) assert.throws(() => normalizeEmail(email));
  assert.equal(normalizeEmail(' Builder+tag@Gmail.com '), 'builder+tag@gmail.com');
  await assert.rejects(validateEmailDomain('a@sub.mailinator.com', () => { throw Error('must not resolve'); }), /Temporary/);
  for (const resolver of [async () => [], async () => [{ exchange: '.' }], async () => { throw Error('ENOTFOUND'); }, () => new Promise(() => {})]) await assert.rejects(validateEmailDomain('a@example.com', resolver, 5), /cannot receive mail/);
  assert.equal(await validateEmailDomain('a@example.com', async () => [{ exchange: 'mx.example.com' }]), 'a@example.com');
});
test('new local users require verification and legacy users retain access', () => {
  const User = require('../models/User');
  assert.equal(new User({ name: 'New', email: 'new@example.com', authProvider: 'local' }).isVerified, false);
  assert.equal(User.hydrate({ name: 'Legacy', email: 'old@example.com', authProvider: 'local' }).isVerified, true);
  assert.equal(User.hydrate({ name: 'Pending', email: 'pending@example.com', authProvider: 'local', isVerified: false }).isVerified, false);
});
