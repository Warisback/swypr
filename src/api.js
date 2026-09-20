export const API_BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '');
export const USE_MOCK = import.meta.env?.VITE_USE_MOCK !== 'false';

let mockStore;
const clone = (value) => structuredClone(value);
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

async function loadMock() {
  if (!mockStore) {
    mockStore = fetch('/mock/seed.json').then(async response => {
      if (!response.ok) throw new Error('your inbox couldn’t load. try again?');
      const data = await response.json();
      // Move demo timestamps to today. The source fixture retains the contract's ISO shape.
      data.messages.forEach((message, index) => { message.receivedAt = new Date(Date.now() - (index + 1) * 180000).toISOString(); });
      return data;
    }).catch(error => { mockStore = undefined; throw error; });
  }
  return mockStore;
}

function draftFor(tree, context) {
  if (!tree) throw new Error('there isn’t a saved answer for this one yet.');
  if (!tree.contextQuestion) return { text: tree.flatAnswer || tree.branches[0]?.answer || '', needsContext: false };
  if (!context) return { text: tree.contextQuestion, needsContext: true };
  const branch = tree.branches.find(item => item.condition === context);
  if (!branch) throw new Error('choose one of your saved options.');
  return { text: branch.answer, needsContext: false };
}

async function mockRequest(path, method, body = {}) {
  const data = await loadMock();
  if (path === '/api/queue' && method === 'GET') return clone({ messages: data.messages, stats: data.stats });
  if (path === '/api/answer-bank' && method === 'GET') return clone({ trees: data.trees, stats: data.stats, unansweredThemes: data.unansweredThemes });
  if (path === '/api/trees' && method === 'POST') {
    const tree = { id: `tree_${crypto.randomUUID()}`, question: body.question, contextQuestion: body.contextQuestion || null, branches: body.branches || [], flatAnswer: body.flatAnswer || null, autoSend: !!body.autoSend, usedCount: 0, builtFrom: [], createdAt: new Date().toISOString() };
    data.trees.unshift(tree);
    data.stats.savedAnswers = data.trees.length;
    data.messages.forEach(message => {
      if (!message.matchedTreeId && (normalize(message.text).includes(normalize(tree.question)) || normalize(tree.question).includes(normalize(message.text)))) {
        message.matchedTreeId = tree.id;
        message.clusterId = `cluster_${tree.id}`;
        message.draft = draftFor(tree);
      }
    });
    data.unansweredThemes = data.unansweredThemes.filter(theme => normalize(theme.label) !== normalize(tree.question));
    return clone(tree);
  }
  const treeMatch = path.match(/^\/api\/trees\/([^/]+)$/);
  if (treeMatch && method === 'PATCH') {
    const tree = data.trees.find(item => item.id === decodeURIComponent(treeMatch[1]));
    if (!tree) throw new Error('that saved answer couldn’t be found.');
    Object.assign(tree, body);
    return clone(tree);
  }
  const match = path.match(/^\/api\/messages\/([^/]+)\/(skip|draft|send)$/);
  if (match && method === 'POST') {
    const message = data.messages.find(item => item.id === decodeURIComponent(match[1]));
    if (!message) throw new Error('that message couldn’t be found.');
    if (match[2] === 'draft') return clone(draftFor(data.trees.find(tree => tree.id === message.matchedTreeId), body.context));
    if (match[2] === 'skip') message.status = 'skipped';
    if (match[2] === 'send') {
      if (!body.text?.trim()) throw new Error('your reply needs a few words first.');
      if (message.status === 'answered') return clone(message);
      message.status = 'answered';
      message.draft = { text: body.text, needsContext: false };
      const tree = data.trees.find(item => item.id === message.matchedTreeId);
      if (tree) tree.usedCount += 1;
    }
    return clone(message);
  }
  if (path === '/api/simulate-incoming' && method === 'POST') {
    if (body?.reset) {
      data.messages = data.messages.filter(message => !String(message.id).startsWith('live_'));
      return clone({ ok: true, reset: true });
    }
    const tree = data.trees.find(item => item.id === 'tree_glass');
    const message = { id: `live_${crypto.randomUUID()}`, source: 'live', sender: { id: 'tester_liv', handle: '@livwithit' }, text: 'maya quick one — glass drop. worth the hype or save my money?', receivedAt: new Date().toISOString(), status: tree?.autoSend ? 'auto_sent' : 'unanswered', clusterId: 'cluster_glass', matchedTreeId: tree?.id || null, draft: tree ? draftFor(tree) : null };
    if (tree?.autoSend) tree.usedCount += 1;
    data.messages.unshift(message);
    data.stats.totalMessages += 1;
    return clone(message);
  }
  throw new Error(`Unsupported route: ${method} ${path}`);
}

// All UI calls go through this adapter. No automatic retries of mutations.
export async function request(path, { method = 'GET', body, signal } = {}) {
  if (USE_MOCK) return mockRequest(path, method, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: signal || controller.signal });
    const raw = await response.text();
    let result;
    try { result = raw ? JSON.parse(raw) : null; } catch { throw new Error('we couldn’t read that response. your words are still here.'); }
    if (!response.ok) {
      const error = new Error(result?.error || result?.message || 'that didn’t go through. give it another try.');
      error.status = response.status;
      throw error;
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('the connection took too long. check your inbox before sending again.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function normalizeDraft(result, message) {
  const draft = result?.draft ?? result?.message?.draft ?? result ?? message?.draft;
  if (!draft || typeof draft.text !== 'string') throw new Error('your saved answer couldn’t load. try again?');
  return { text: draft.text, needsContext: !!draft.needsContext };
}
