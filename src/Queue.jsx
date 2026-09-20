import React, { useRef } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { ArrowUpRight, Check, Layers, Sparkles, X, Heart } from 'lucide-react';
import { Flower, Sender } from './components';
import { threadCount } from './threads';
function SwipeCard({ message, count, thread, onOpen, onSkip }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-13, 0, 13]);
  const skipOpacity = useTransform(x, [-90, -25, 0], [1, 0, 0]);
  const replyOpacity = useTransform(x, [0, 25, 90], [0, 0, 1]);
  const dragging = useRef(false);
  const reduced = useReducedMotion();
  return <motion.article className={`message-card ${message.source === 'live' ? 'live-card' : ''}`} role="button" tabIndex={0} aria-label={`Reply to ${message.sender.handle}: ${message.text}`} style={{ x, rotate }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.75} dragSnapToOrigin dragTransition={{ bounceStiffness: 420, bounceDamping: 28 }} onDragStart={() => { dragging.current = true; }} onDragEnd={(_, info) => {
    if (info.offset.x > 90 || (info.offset.x > 35 && info.velocity.x > 650)) onOpen();
    if (info.offset.x < -90 || (info.offset.x < -35 && info.velocity.x < -650)) onSkip();
    setTimeout(() => { dragging.current = false; }, 120);
  }} onClick={() => { if (!dragging.current) onOpen(); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} initial={{ opacity: 0, y: reduced ? 0 : message.source === 'live' ? -60 : 18, scale: reduced ? 1 : .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : .95 }} transition={{ type: 'spring', stiffness: 340, damping: 29 }}>
    <motion.div className="swipe-stamp skip-stamp" style={{ opacity: skipOpacity }}>skip <X size={18}/></motion.div><motion.div className="swipe-stamp reply-stamp" style={{ opacity: replyOpacity }}>reply <ArrowUpRight size={18}/></motion.div><Sender message={message}/>{(message.clusterId || thread > 1) && <span className="badge-row">{message.clusterId && <span className="cluster-badge"><Layers size={13}/>{count > 1 ? `asked ${count}× in your inbox` : 'a familiar question'}</span>}{thread > 1 && <span className="cluster-badge">{thread} messages with you</span>}</span>}<p className={`message-text ${message.text.length > 115 ? 'long-message' : ''}`}>“{message.text}”</p><div className="match-note"><span>{message.matchedTreeId ? <Sparkles size={14}/> : <Heart size={14}/>} {message.matchedTreeId ? 'you’ve got an answer for this' : 'this one needs a little you'}</span><ArrowUpRight size={18}/></div>
  </motion.article>;
}
export default function Queue({ inbox, openAnswer }) {
  const { queue, messages } = inbox;
  const top = queue[0];
  const today = new Date().toDateString();
  const autoCount = messages.filter(message => message.status === 'auto_sent' && new Date(message.receivedAt).toDateString() === today).length;
  return <section className="queue-view"><div className="greeting"><h1>hey maya.<br/>make room for <em>you.</em></h1><Flower/></div><div className="daily-strip" aria-live="polite"><div><span className="stat-dot"/><strong>{queue.length}</strong> in your queue</div><div><Sparkles size={15}/><strong>{autoCount}</strong> handled today</div></div>{top ? <div className="card-stack"><div className="stack-sheet sheet-back"/><div className="stack-sheet sheet-mid"/><AnimatePresence mode="wait"><SwipeCard key={top.id} message={top} count={messages.filter(m => m.clusterId === top.clusterId).length} thread={threadCount(messages, top)} onOpen={() => openAnswer(top)} onSkip={() => inbox.actOnMessage(top, 'skip')}/></AnimatePresence></div> : <div className="empty-state"><div className="empty-flower"><Flower/><Check size={35}/></div><span className="eyebrow">A VERY GOOD KIND OF NOTHING</span><h2>all caught up.<br/><em>go be you.</em></h2><p>{autoCount} replies handled without you today.<br/>the rest? you’ve got them covered.</p></div>}</section>;
}
