import React, { useRef, useState } from 'react';
import { ArrowLeft, Check, Plus, X, LoaderCircle, CornerDownRight } from 'lucide-react';
import { Switch } from './components';
export default function Builder({ initialQuestion, onCancel, onSave }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [clarify, setClarify] = useState(false);
  const [contextQuestion, setContextQuestion] = useState('');
  const [flatAnswer, setFlatAnswer] = useState('');
  const [branches, setBranches] = useState([{ condition: '', answer: '' }, { condition: '', answer: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const updateBranch = (index, key, value) => setBranches(current => current.map((branch, i) => i === index ? { ...branch, [key]: value } : branch));
  const save = async event => {
    event.preventDefault(); if (saving.current) return;
    if (clarify && new Set(branches.map(branch => branch.condition.trim().toLowerCase())).size !== branches.length) { setError('give each option its own name.'); return; }
    if (clarify ? !contextQuestion.trim() || branches.some(branch => !branch.condition.trim() || !branch.answer.trim()) : !flatAnswer.trim()) { setError('add your answer before saving.'); return; }
    saving.current = true; setBusy(true); setError('');
    try { await onSave({ question: question.trim(), contextQuestion: clarify ? contextQuestion.trim() : null, branches: clarify ? branches.map(branch => ({ condition: branch.condition.trim(), answer: branch.answer.trim() })) : [], flatAnswer: clarify ? null : flatAnswer.trim(), autoSend: false }); }
    catch (issue) { setError(issue.message); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="builder-view"><button className="back-button" onClick={onCancel} disabled={busy}><ArrowLeft size={17}/> go back</button><div className="view-heading"><h1>a little wisdom.<br/><em>on repeat.</em></h1></div><form onSubmit={save}><label className="field-label" htmlFor="question">what are they asking?</label><textarea id="question" className="form-input question-input" value={question} onChange={event => setQuestion(event.target.value)} required maxLength={500} placeholder="e.g. do i need the barrier cream?"/><div className="clarify-setting"><div><strong>it depends?</strong><p>ask one quick question first.</p></div><Switch checked={clarify} onChange={() => setClarify(!clarify)} label="Ask a clarifying question"/></div>{clarify ? <div className="builder-fork"><label className="field-label" htmlFor="clarification">your quick question</label><input className="form-input" id="clarification" value={contextQuestion} onChange={event => setContextQuestion(event.target.value)} required maxLength={200} placeholder="dry or oily?"/>{branches.map((branch, index) => <div className="branch-fields" key={index}><div className="branch-label"><CornerDownRight size={16}/><span>option {index + 1}</span>{branches.length > 1 && <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => setBranches(current => current.filter((_, i) => i !== index))}><X size={14}/></button>}</div><input className="form-input" aria-label={`Option ${index + 1} condition`} placeholder={index ? 'e.g. oily' : 'e.g. dry'} value={branch.condition} onChange={event => updateBranch(index, 'condition', event.target.value)} required maxLength={100}/><textarea className="form-input" aria-label={`Option ${index + 1} answer`} placeholder="then you’d say…" value={branch.answer} onChange={event => updateBranch(index, 'answer', event.target.value)} required maxLength={2000}/></div>)}{branches.length < 2 && <button className="text-button" type="button" onClick={() => setBranches(current => [...current, { condition: '', answer: '' }])}><Plus size={16}/> add another option</button>}</div> : <><label className="field-label" htmlFor="flat-answer">what would you say?</label><textarea id="flat-answer" className="form-input flat-input" value={flatAnswer} onChange={event => setFlatAnswer(event.target.value)} required maxLength={2000} placeholder="no scripts. just your honest answer."/></>}{error && <p className="inline-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy || !question.trim()} type="submit">{busy ? <>saving <LoaderCircle size={18} className="spin"/></> : <>save my answer <Check size={18}/></>}</button></form></section>;
}
