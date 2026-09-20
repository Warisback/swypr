import { useCallback, useEffect, useRef, useState } from 'react';
import { request, USE_MOCK } from './api';
import { groupBySender } from './threads';

export function useInbox() {
  const [messages, setMessages] = useState([]);
  const [bank, setBank] = useState({ trees: [], stats: null, unansweredThemes: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [uncertain, setUncertain] = useState(new Set());
  const [promotedId, setPromotedId] = useState(null);
  const hiddenRef = useRef(new Set());
  const inFlight = useRef(null);
  const pending = useRef(new Set());
  const patching = useRef(new Set());
  const drafts = useRef(new Map());
  const toastTimer = useRef();
  const notify = useCallback((text, tone = 'success', action) => {
    clearTimeout(toastTimer.current);
    setToast({ text, tone, action });
    toastTimer.current = setTimeout(() => setToast(null), tone === 'error' ? 10000 : 3200);
  }, []);
  const knownIds = useRef(null);
  const refreshQueue = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const task = request('/api/queue').then(data => {
      if (!Array.isArray(data?.messages)) throw new Error('your inbox couldn’t load. try again?');
      if (knownIds.current) {
        const fresh = data.messages.find(item => item.source === 'live' && item.status === 'unanswered' && !knownIds.current.has(item.id));
        if (fresh) notify(`new reply from ${fresh.sender.handle}`);
      }
      knownIds.current = new Set(data.messages.map(item => item.id));
      setMessages(data.messages); setStats(data.stats); setError(''); return data;
    }).finally(() => { inFlight.current = null; });
    inFlight.current = task; return task;
  }, [notify]);
  const refreshBank = useCallback(async () => {
    const data = await request('/api/answer-bank');
    if (!Array.isArray(data?.trees)) throw new Error('your saved answers couldn’t load.');
    setBank(data); return data;
  }, []);
  const refreshFreshQueue = useCallback(async () => {
    if (inFlight.current) { try { await inFlight.current; } catch { /* request a fresh snapshot */ } }
    return refreshQueue();
  }, [refreshQueue]);
  const reload = useCallback(async () => {
    try { await Promise.all([refreshQueue(), refreshBank()]); }
    catch (issue) { setError(issue.message); }
    finally { setLoading(false); }
  }, [refreshQueue, refreshBank]);
  useEffect(() => {
    reload();
    if (USE_MOCK) return;
    const interval = setInterval(() => { refreshQueue().catch(() => setError('reconnecting to your inbox. your replies are safe here.')); }, 2000);
    return () => clearInterval(interval);
  }, [reload, refreshQueue]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const hideMessage = (id, value) => {
    const next = new Set(hiddenRef.current);
    value ? next.add(id) : next.delete(id);
    hiddenRef.current = next; setHidden(next);
  };
  const actOnMessage = async (message, action, text, onRestore) => {
    if (pending.current.has(message.id) || hiddenRef.current.has(message.id) || uncertain.has(message.id)) return false;
    pending.current.add(message.id);
    if (text) drafts.current.set(message.id, { ...(drafts.current.get(message.id) || {}), text });
    hideMessage(message.id, true);
    try {
      await request(`/api/messages/${encodeURIComponent(message.id)}/${action}`, { method: 'POST', body: action === 'send' ? { text } : undefined });
      setMessages(current => current.map(item => item.id === message.id ? { ...item, status: action === 'send' ? 'answered' : 'skipped' } : item));
      drafts.current.delete(message.id);
      notify(action === 'send' ? 'sent. still sounds like you.' : 'skipped. on to the next.');
      refreshBank().catch(() => {}); return true;
    } catch (issue) {
      // A timed-out send may have succeeded. Reconcile before offering a retry.
      let reconciled;
      try { reconciled = await refreshFreshQueue(); } catch { /* preserve local state */ }
      const serverMessage = reconciled?.messages.find(item => item.id === message.id);
      const completed = serverMessage && (action === 'send' ? ['answered', 'auto_sent'].includes(serverMessage.status) : serverMessage.status === 'skipped');
      if (completed) { drafts.current.delete(message.id); notify(action === 'send' ? 'sent. still sounds like you.' : 'skipped. on to the next.'); return true; }
      hideMessage(message.id, false);
      if (action === 'send' && (!issue.status || issue.status >= 500)) setUncertain(current => new Set([...current, message.id]));
      setMessages(current => current.some(item => item.id === message.id) ? current : [message, ...current]);
      notify(action === 'send' && !issue.status ? 'couldn’t confirm the send. check before retrying — your draft is saved.' : issue.message, 'error', onRestore);
      return false;
    } finally { pending.current.delete(message.id); }
  };
  const toggleAuto = async (tree) => {
    if (patching.current.has(tree.id)) return;
    patching.current.add(tree.id);
    const next = !tree.autoSend;
    setBank(current => ({ ...current, trees: current.trees.map(item => item.id === tree.id ? { ...item, autoSend: next } : item) }));
    try { await request(`/api/trees/${encodeURIComponent(tree.id)}`, { method: 'PATCH', body: { autoSend: next } }); notify(next ? 'trusted. future matches can send themselves.' : 'back to you for a quick check.'); }
    catch (issue) { setBank(current => ({ ...current, trees: current.trees.map(item => item.id === tree.id ? { ...item, autoSend: tree.autoSend } : item) })); notify(issue.message, 'error'); }
    finally { patching.current.delete(tree.id); }
  };
  const saveTree = async body => {
    await request('/api/trees', { method: 'POST', body });
    try { await Promise.all([refreshFreshQueue(), refreshBank()]); }
    catch { setError('your answer is saved. refresh to see the latest inbox.'); }
    notify('saved. a little less repeating yourself.');
  };
  const simulate = async () => {
    try { await request('/api/simulate-incoming', { method: 'POST' }); setPromotedId(null); await Promise.all([refreshFreshQueue(), refreshBank()]); }
    catch (issue) { notify(issue.message, 'error'); }
  };
  const deleteTree = async (tree) => {
    setBank(current => ({ ...current, trees: current.trees.filter(item => item.id !== tree.id) }));
    try {
      await request(`/api/trees/${encodeURIComponent(tree.id)}`, { method: 'DELETE' });
      await Promise.all([refreshFreshQueue(), refreshBank()]);
      notify('gone. like it never happened.');
    } catch (issue) {
      refreshBank().catch(() => {});
      notify(issue.message, 'error');
    }
  };
  const resetDemo = async () => {
    try {
      await request('/api/simulate-incoming', { method: 'POST', body: { reset: true } });
      setPromotedId(null);
      await Promise.all([refreshFreshQueue(), refreshBank()]);
      notify('scene reset. roll again.');
    } catch (issue) { notify(issue.message, 'error'); }
  };
  const promoteGlass = () => {
    const target = messages.find(item => /glass\s*drop/i.test(item.text) && item.status === 'unanswered' && !hiddenRef.current.has(item.id));
    if (!target) { notify('no Glass Drop questions waiting right now.'); return; }
    setPromotedId(target.id);
  };
  const checkSend = async message => {
    try {
      const data = await refreshFreshQueue();
      const current = data.messages.find(item => item.id === message.id);
      if (current && ['answered', 'auto_sent'].includes(current.status)) {
        hideMessage(message.id, true);
        setUncertain(ids => new Set([...ids].filter(id => id !== message.id)));
        drafts.current.delete(message.id);
        notify('confirmed. your reply went through.'); return true;
      }
      notify('still unconfirmed. check the conversation before allowing a retry.', 'error');
    } catch { notify('still offline. your draft is saved here.', 'error'); }
    return false;
  };
  const allowRetry = id => setUncertain(ids => new Set([...ids].filter(item => item !== id)));
  const queue = groupBySender(messages.filter(item => item.status === 'unanswered' && !hidden.has(item.id)));
  const promoted = queue.find(item => item.id === promotedId);
  if (promoted) { queue.splice(queue.indexOf(promoted), 1); queue.unshift(promoted); }
  return { messages, queue, bank, stats, loading, error, toast, drafts, uncertain, checkSend, allowRetry, refreshBank, reload, notify, actOnMessage, toggleAuto, saveTree, simulate, promoteGlass, resetDemo, deleteTree };
}
