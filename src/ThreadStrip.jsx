import React from 'react';
import { threadEntries } from './threads';

// Context strip above the draft: the last few turns of this conversation,
// theirs and ours. Renders nothing for a first-contact message.
export default function ThreadStrip({ messages, message }) {
  const entries = threadEntries(messages, message);
  if (!entries.length) return null;
  return <div className="thread-strip" aria-label="Earlier in this conversation"><span className="eyebrow">EARLIER IN THIS CHAT</span>{entries.map(entry => <p key={entry.id} className={entry.who === 'us' ? 'from-us' : 'from-them'}>{entry.text}</p>)}</div>;
}
