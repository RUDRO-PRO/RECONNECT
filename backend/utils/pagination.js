const { bad } = require('../validation');
function page(query = {}) {
  const number = (value, fallback) => value === undefined ? fallback : Number(value);
  const current = number(query.page, 1), limit = Math.min(30, number(query.limit, 30));
  if (!Number.isInteger(current) || current < 1 || current > 1000 || !Number.isInteger(limit) || limit < 1) bad('Invalid pagination. Use page >= 1 and limit 1–30.');
  return { page: current, limit, skip: (current - 1) * limit };
}
function messagePage(query = {}) {
  const { limit, skip } = page(query), direction = query.after !== undefined ? 'after' : query.before !== undefined ? 'before' : null;
  if (query.after !== undefined && query.before !== undefined) bad('Choose after or before, not both.');
  const filter = {};
  if (direction) {
    const value = query[direction], date = new Date(value), id = query[direction + 'Id'];
    if (typeof value !== 'string' || !Number.isFinite(+date)) bad('Invalid message timestamp.');
    const op = direction === 'after' ? '$gt' : '$lt';
    if (id !== undefined) {
      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) bad('Invalid message cursor.');
      filter.$or = [{ createdAt: { [op]: date } }, { createdAt: date, _id: { [op]: id } }];
    } else filter.createdAt = { [direction === 'after' ? '$gte' : '$lt']: date };
  }
  return { filter, sort: direction === 'after' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }, reverse: direction !== 'after', limit, skip: direction ? 0 : skip };
}
module.exports = { page, messagePage };
