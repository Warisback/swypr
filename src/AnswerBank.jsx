import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ArrowRight, Check, Copy, Download, Layers, Sparkles, ChevronDown, Plus, CornerDownRight, WandSparkles } from 'lucide-react';
import { Flower, Switch } from './components';

function composeBrief({ trees, stats, unansweredThemes }, messages) {
  const asked = tree => messages.filter(message => message.matchedTreeId === tree.id).length;
  const lines = ['# what maya’s audience asked this month', '', `${stats?.totalMessages ?? messages.length} messages in her DMs.`, '', '## they keep asking. no saved answer yet.', ''];
  (unansweredThemes || []).forEach(theme => {
    lines.push(`### ${theme.label} — asked ${theme.count} times`);
    (theme.examples || []).slice(0, 2).forEach(example => lines.push(`> “${example}”`));
    lines.push('');
  });
  lines.push('## already answered — maya’s saved answers', '');
  trees.forEach(tree => lines.push(`- “${tree.question}” — asked ${asked(tree)} times, her reply used ${tree.usedCount} times`));
  lines.push('', 'paste this into whatever ai you already use. it’s briefed on what the audience actually asked.');
  return lines.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // demo phones open this over plain http — clipboard API needs a fallback
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    try { return document.execCommand('copy'); } catch { return false; } finally { area.remove(); }
  }
}
function ExportPanel({ bank, messages, notify }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const brief = composeBrief(bank, messages);
  const copy = async () => {
    if (await copyText(brief)) { setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2600); }
    else notify('couldn’t reach your clipboard. download it instead.', 'error');
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'maya-content-brief.md';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  return <div className="export-panel"><button className="export-button" aria-expanded={open} onClick={() => setOpen(!open)}><span className="round-icon export-icon"><WandSparkles size={20}/></span><div><strong>export for your ai</strong><p>a month of questions, briefed in one paste.</p></div><ChevronDown size={17} className={open ? 'rotated' : ''}/></button><AnimatePresence>{open && <motion.div className="export-body" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><pre aria-label="Content brief preview">{brief}</pre><p className="export-note">paste this into whatever ai you already use — it’s briefed on what your audience actually asked.</p><div className="export-actions"><button className={`primary-button ${copied ? 'copied' : ''}`} onClick={copy}>{copied ? <>in your clipboard. go create. <Check size={17}/></> : <>copy it <Copy size={16}/></>}</button><button className="text-button" onClick={download}><Download size={16}/> download maya-content-brief.md</button></div></motion.div>}</AnimatePresence></div>;
}
function TreeRow({ tree, asked, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={`tree-row ${expanded ? 'expanded' : ''}`}><button className="tree-summary" aria-expanded={expanded} aria-controls={`details-${tree.id}`} onClick={() => setExpanded(!expanded)}><div className="tree-symbol"><Layers size={19}/></div><div><h3>{tree.question}</h3><p>{asked ? `${asked} in your inbox · ` : ''}used {tree.usedCount} times</p></div><ChevronDown size={17} className={expanded ? 'rotated' : ''}/></button><div className="tree-status-line"><span className={tree.autoSend ? 'auto-badge' : 'review-badge'}>{tree.autoSend ? <Sparkles size={11}/> : <Check size={11}/>} {tree.autoSend ? 'sends itself' : 'you approve'}</span><Switch checked={tree.autoSend} onChange={() => onToggle(tree)} label={`Auto-send: ${tree.question}`}/></div><AnimatePresence>{expanded && <motion.div id={`details-${tree.id}`} className="tree-details" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><div className="answer-fork">{tree.contextQuestion ? <><div className="fork-question">“{tree.contextQuestion}”</div>{tree.branches.map(branch => <div className="fork-branch" key={branch.condition}><CornerDownRight size={16}/><div><strong>{branch.condition}</strong><p>{branch.answer}</p></div></div>)}</> : <p>{tree.flatAnswer || tree.branches[0]?.answer}</p>}</div><div className="receipts"><span className="eyebrow">{tree.builtFrom?.length ? `BUILT FROM ${tree.builtFrom.length} OF MAYA’S PAST REPLIES` : 'SAVED BY YOU. IN YOUR OWN WORDS.'}</span>{tree.builtFrom?.slice(0, 2).map((excerpt, i) => <blockquote key={i}>“{excerpt}”</blockquote>)}</div></motion.div>}</AnimatePresence></div>;
}
export default function AnswerBank({ inbox, onBuild }) {
  const { trees, stats, unansweredThemes } = inbox.bank;
  return <section className="bank-view"><div className="view-heading bank-heading"><h1>say it once.<br/><em>make it count.</em></h1><Flower/></div>{stats && <div className="bank-stats"><div><strong>{stats.coveragePct}<small>%</small></strong><span>covered</span></div><div><strong><s>{stats.hoursBefore}</s><ArrowRight size={14}/>{stats.hoursAfter}<small>h</small></strong><span>per month</span></div><div><strong>{stats.savedAnswers}</strong><span>saved answers</span></div></div>}<div className="section-label bank-section-label"><h2>your answer bank <span>{trees.length}</span></h2><button aria-label="Build a new saved answer" onClick={() => onBuild('')}><Plus size={19}/></button></div><div className="tree-list">{trees.length ? trees.map(tree => <TreeRow key={tree.id} tree={tree} asked={inbox.messages.filter(message => message.matchedTreeId === tree.id).length} onToggle={inbox.toggleAuto}/>) : <div className="bank-empty"><Layers size={28}/><h2>your voice belongs here.</h2><p>save your first answer. let it do a little more.</p><button className="text-button" onClick={() => onBuild('')}>build an answer <Plus size={16}/></button></div>}</div>{!!unansweredThemes?.length && <div className="themes-panel"><span className="eyebrow">YOUR NEXT “YOU ASKED…”</span><h2>{unansweredThemes.length} things they<br/>keep asking.</h2><p className="themes-intro">no saved answer yet. maybe your next post?</p>{unansweredThemes.map(theme => <div className="theme-row" key={theme.label}><div><h3>{theme.label}</h3><span>asked {theme.count} times</span></div><button onClick={() => onBuild(theme.label)} aria-label={`Build answer: ${theme.label}`}>build <ArrowUpRight size={16}/></button></div>)}<Flower/></div>}{stats && <ExportPanel bank={inbox.bank} messages={inbox.messages} notify={inbox.notify}/>}</section>;
}
