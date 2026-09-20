import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { ArrowLeft, Check, Layers, Inbox, X, RotateCcw } from 'lucide-react';
import { useInbox } from './useInbox';
import { Brand, Flower } from './components';
import Queue from './Queue';
import Answer from './Answer';
import AnswerBank from './AnswerBank';
import Builder from './Builder';

function Shortcuts({ onClose }) {
  const dialog = useRef();
  useEffect(() => { const previous = document.activeElement; dialog.current.showModal(); return () => { previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="shortcut-dialog" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}><div className="shortcut-head"><h2>a little backstage magic.</h2><button autoFocus aria-label="Close shortcuts" onClick={onClose}><X size={20}/></button></div><p><kbd>L</kbd> bring in a new message</p><p><kbd>G</kbd> put Glass Drop first</p><p><kbd>?</kbd> these shortcuts</p><p><kbd>Esc</kbd> back to your inbox</p></dialog>;
}
export default function App() {
  const inbox = useInbox();
  const [view, setView] = useState('queue');
  const [selected, setSelected] = useState(null);
  const [buildQuestion, setBuildQuestion] = useState('');
  const [buildOrigin, setBuildOrigin] = useState('queue');
  const [shortcuts, setShortcuts] = useState(false);
  const screenTop = useRef();
  const sending = useRef(new Set());
  const lastSend = useRef(0);
  const openAnswer = message => { setSelected(message); setView('answer'); };
  const openBuilder = question => { setBuildQuestion(question); setBuildOrigin(view); setView('builder'); };
  const send = (message, text) => {
    if (sending.current.has(message.id) || Date.now() - lastSend.current < 650) return;
    lastSend.current = Date.now();
    sending.current.add(message.id);
    const next = inbox.queue.find(item => item.id !== message.id);
    inbox.actOnMessage(message, 'send', text, () => openAnswer(message)).finally(() => sending.current.delete(message.id));
    if (next) openAnswer(next); else setView('queue');
  };
  useEffect(() => { screenTop.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }, [view, selected?.id]);
  useEffect(() => {
    if (view !== 'bank') return;
    inbox.refreshBank().catch(() => {});
    const interval = setInterval(() => inbox.refreshBank().catch(() => {}), 2000);
    return () => clearInterval(interval);
  }, [view, inbox.refreshBank]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({ name: 'swypr_open_view', title: 'Open Swypr view', description: 'Navigate to the inbox or Answer Bank. Does not send messages or change saved answers.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['inbox', 'answer-bank'] } }, required: ['view'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async input => {
        if (!input || !['inbox', 'answer-bank'].includes(input.view) || Object.keys(input).some(key => key !== 'view')) throw new Error('view must be inbox or answer-bank');
        setView(input.view === 'inbox' ? 'queue' : 'bank');
        await new Promise(resolve => setTimeout(resolve, 200));
        return { view: input.view, opened: true };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* The visible interface always works without this enhancement. */ }
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const handler = event => {
      if (event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey)) return;
      if (shortcuts) return;
      if (event.key.toLowerCase() === 'l') { event.preventDefault(); inbox.simulate(); }
      if (event.key.toLowerCase() === 'g') { event.preventDefault(); inbox.promoteGlass(); setView('queue'); }
      if (event.key === '?') setShortcuts(true);
      if (event.key === 'Escape') setView('queue');
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  const activeTree = selected && inbox.bank.trees.find(tree => tree.id === selected.matchedTreeId);
  return <MotionConfig reducedMotion="user"><div className="desktop-stage"><aside className="desktop-brand"><Brand small/><span>a little less inbox.</span></aside><main className={`app-shell view-${view}`}><div ref={screenTop} className="screen-top"/><header className="app-header"><Brand/><div className="profile" aria-label="Maya's profile">m<span/>{inbox.queue.filter(item => item.source === 'live').length > 0 && <i className="live-count" aria-label="New live replies">{inbox.queue.filter(item => item.source === 'live').length}</i>}</div></header>{inbox.error && <div className="connection-error" role="alert"><span>{inbox.error}</span><button onClick={inbox.reload} aria-label="Retry loading inbox"><RotateCcw size={16}/></button></div>}
    {inbox.loading ? <div className="loading-state" role="status"><Flower/><p>making a little space…</p></div> : <AnimatePresence mode="wait" initial={false}><motion.div className="screen-content" key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .15 }}>{view === 'queue' && <Queue inbox={inbox} openAnswer={openAnswer}/>} {view === 'answer' && selected && <Answer key={selected.id} message={selected} tree={activeTree} inbox={inbox} onBack={() => setView('queue')} onSend={send} onBuild={openBuilder}/>} {view === 'bank' && <AnswerBank inbox={inbox} onBuild={openBuilder}/>} {view === 'builder' && <Builder initialQuestion={buildQuestion} onCancel={() => setView(buildOrigin)} onSave={async body => { await inbox.saveTree(body); setView('queue'); }}/>}</motion.div></AnimatePresence>}
    <nav className="bottom-nav" aria-label="Main navigation"><button className={view !== 'bank' ? 'active' : ''} aria-current={view === 'queue' ? 'page' : undefined} onClick={() => setView('queue')}><Inbox size={21}/><span>inbox</span><i>{inbox.queue.length}</i></button><button className={view === 'bank' ? 'active' : ''} aria-current={view === 'bank' ? 'page' : undefined} onClick={() => setView('bank')}><Layers size={21}/><span>answer bank</span></button></nav>
    <AnimatePresence>{inbox.toast && <motion.div className={`toast ${inbox.toast.tone}`} role={inbox.toast.tone === 'error' ? 'alert' : 'status'} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>{inbox.toast.tone === 'success' && <Check size={16}/>}<span>{inbox.toast.text}</span>{inbox.toast.action && <button onClick={inbox.toast.action}>review</button>}</motion.div>}</AnimatePresence>
  </main><aside className="desktop-note"><div className="note-line"/><p>still you.<br/>just with a little<br/><em>more time.</em></p><span>YOUR WORDS. YOUR CALL.</span></aside>{shortcuts && <Shortcuts onClose={() => setShortcuts(false)}/>}</div></MotionConfig>;
}
