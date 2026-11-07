export function mergeMessages(existing, incoming) {
  const messages = new Map(existing.map(message => [message._id, message]));
  for (const message of incoming) {
    if (message.clientMessageId) messages.delete(message.clientMessageId);
    messages.set(message._id, message);
  }
  return [...messages.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id));
}

export function messagePollDelay(open, hidden) {
  return open && !hidden ? 2500 : 30000;
}
