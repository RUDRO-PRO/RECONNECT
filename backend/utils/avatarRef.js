const crypto = require('node:crypto');
function avatarRef(userId, value) {
  if (!value?.startsWith('data:')) return value || '';
  return `/api/avatars/${userId}?v=${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}
module.exports = { avatarRef };
