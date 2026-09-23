// Conversation helpers: sender grouping and flattened thread history.

// One card per person: keep the first (newest-sorted) unanswered message per sender.
export function groupBySender(queue) {
  const seen = new Set();
  return queue.filter(message => {
    const id = message.sender?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// How many messages this sender has in the inbox, all statuses.
export function threadCount(messages, message) {
  return messages.filter(item => item.sender?.id === message.sender?.id).length;
}

// Flattened exchange for the context strip: their messages and our sent
// replies, oldest first, excluding the message currently open.
export function threadEntries(messages, current, limit = 4) {
  const items = messages
    .filter(item => item.sender?.id === current.sender?.id && item.id !== current.id)
    .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
  const entries = [];
  for (const item of items) {
    entries.push({ id: `${item.id}-them`, who: 'them', text: item.text });
    const replyText = item.reply?.text ?? (['answered', 'auto_sent'].includes(item.status) ? item.draft?.text : null);
    if (replyText) entries.push({ id: `${item.id}-us`, who: 'us', text: replyText });
  }
  return entries.slice(-limit);
}
