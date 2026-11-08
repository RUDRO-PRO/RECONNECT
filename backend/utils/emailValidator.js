const dns = require('node:dns').promises;
const blocked = new Set(['mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com', '10minutemail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'fakeinbox.com']);
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function normalizeEmail(value) {
  if (typeof value !== 'string') invalid('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  const [local, domain] = parts;
  if (email.length > 254 || parts.length !== 2 || !local || local.length > 64 ||
      !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain || domain.length > 253 || !domain.includes('.') ||
      !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$/.test(domain.split('.').at(-1)))
    invalid('Enter a valid email address.');
  return email;
}
async function validateEmailDomain(value, resolveMx = domain => dns.resolveMx(domain), timeoutMs = 3000) {
  const email = normalizeEmail(value), domain = email.split('@')[1];
  if ([...blocked].some(d => domain === d || domain.endsWith('.' + d))) invalid('Temporary email addresses are not supported. Use your personal or work email.');
  let timer;
  try {
    const records = await Promise.race([resolveMx(domain), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
    if (!records.some(r => r.exchange && r.exchange !== '.')) throw new Error('No mail server');
  } catch { invalid('This email domain cannot receive mail or could not be checked. Check the address and try again.'); }
  finally { clearTimeout(timer); }
  return email;
}
module.exports = { normalizeEmail, validateEmailDomain };
