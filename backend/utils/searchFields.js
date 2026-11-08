// Prefix search materialized at write time: indexed, case-insensitive word prefixes.
const words = value => String(value || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) || [];
function searchFields(profile) {
  const skills = (profile.skills || []).map(s => typeof s === 'string' ? s : s.name);
  const terms = [...new Set([...skills, ...(profile.interests || [])].map(s => s.toLowerCase().trim()))];
  const tokens = new Set();
  for (const word of words([profile.fullName, profile.headline, profile.roleTag, ...skills, ...(profile.interests || [])].join(' ')))
    for (let n = 1; n <= Math.min(word.length, 50); n++) tokens.add(word.slice(0, n));
  return { searchTokens: [...tokens].slice(0, 1500), skillKeys: skills.map(s => s.toLowerCase().trim()), termKeys: terms, collegeKey: (profile.college?.institution || '').toLowerCase().trim() };
}
module.exports = { words, searchFields };
