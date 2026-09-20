import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Sparkles, Heart, Plus, Send, LoaderCircle, RotateCcw } from 'lucide-react';
import { request, normalizeDraft } from './api';
import { Sender, Switch } from './components';
import ThreadStrip from './ThreadStrip';
export default function Answer({ message, tree, inbox, onBack, onSend, onBuild }) {
  const cached = inbox.drafts.current.get(message.id);
  const [text, setText] = useState(cached?.text ?? message.draft?.text ?? '');
  const [needsContext, setNeedsContext] = useState(cached?.needsContext ?? message.draft?.needsContext ?? false);
  const [context, setContext] = useState(cached?.context ?? '');
  const [busy, setBusy] = useState(!!message.matchedTreeId && !cached);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const edits = useRef(0);
  const active = useRef(true);
  const fetchDraft = async (nextContext = '') => {
    const revision = ++sequence.current;
    const editRevision = edits.current;
    setBusy(true); setError(''); setContext(nextContext);
    try {
      const result = normalizeDraft(await request(`/api/messages/${encodeURIComponent(message.id)}/draft`, { method: 'POST', body: nextContext ? { context: nextContext } : {} }), message);
      if (active.current && revision === sequence.current && editRevision === edits.current) { setText(result.text); setNeedsContext(result.needsContext); inbox.drafts.current.set(message.id, { ...result, context: nextContext }); }
    } catch (issue) { if (active.current && revision === sequence.current) setError(issue.message); }
    finally { if (active.current && revision === sequence.current) setBusy(false); }
  };
  useEffect(() => { active.current = true; if (message.matchedTreeId && !cached) fetchDraft(); return () => { active.current = false; sequence.current++; }; }, [message.id]);
  return <section className="answer-view"><button className="back-button" onClick={onBack}><ArrowLeft size={17}/> your inbox</button><div className="view-heading"><h1>{message.matchedTreeId ? <>your words.<br/><em>their answer.</em></> : <>a new question.<br/><em>all yours.</em></>}</h1></div><ThreadStrip messages={inbox.messages} message={message}/><div className="original-message"><Sender message={message}/><p>“{message.text}”</p></div>{!message.matchedTreeId ? <div className="unmatched-panel"><span className="round-icon"><Heart size={24}/></span><h2>no saved answer for this yet.</h2><p>maya hasn’t answered this one yet — sending it to her.</p><p className="muted">a good answer now. one less repeat later.</p><button className="primary-button" onClick={() => onBuild(message.text)}><Plus size={18}/> build an answer</button></div> : <><div className="draft-heading"><h2>{needsContext ? 'a quick question first' : 'sounds like you'}</h2><span><Sparkles size={13}/> your saved answer</span></div>{tree?.contextQuestion && <div className="context-options" aria-label="Reply context">{tree.branches.map(branch => <button key={branch.condition} className={context === branch.condition ? 'selected' : ''} onClick={() => fetchDraft(branch.condition)}>{branch.condition}{context === branch.condition && <Check size={14}/>}</button>)}{context && <button className="context-reset" aria-label="Return to clarifying question" onClick={() => fetchDraft('')}><RotateCcw size={14}/></button>}</div>}<div className={`draft-editor ${busy ? 'is-loading' : ''}`}><textarea aria-label="Your reply" value={text} placeholder="your words go here…" onChange={event => { edits.current++; setText(event.target.value); inbox.drafts.current.set(message.id, { text: event.target.value, needsContext, context }); }}/><span className="editor-foot">{busy ? <><LoaderCircle size={13} className="spin"/> finding your words…</> : <>make it sound just right.</>}<span>{text.length}</span></span></div><p className="draft-source">from your saved answer{tree ? ` · used ${tree.usedCount} times` : ''}</p>{error && <div className="inline-error" role="alert">{error}<button onClick={() => fetchDraft(context)}>try again</button></div>}{tree && <div className="auto-send-setting"><div><strong>let this one send itself</strong><p>auto-send this answer from now on</p></div><Switch checked={tree.autoSend} onChange={() => inbox.toggleAuto(tree)} label="Auto-send this answer from now on"/></div>}<>{inbox.uncertain.has(message.id) && <div className="send-uncertain" role="alert"><p>this send is still unconfirmed. check the conversation before trying again.</p><button onClick={async () => { if (await inbox.checkSend(message)) onBack(); }}>check send status</button><button onClick={() => inbox.allowRetry(message.id)}>i checked — allow a retry</button></div>}</><button className="primary-button send-button" disabled={!text.trim() || busy || !!error || inbox.uncertain.has(message.id)} onClick={() => onSend(message, text)}>{needsContext ? 'send the question' : 'send reply'}<Send size={18}/></button></>}</section>;
}
