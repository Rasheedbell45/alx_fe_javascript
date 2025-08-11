// script.js
// Dynamic Quote Generator with localStorage + server sync simulation + conflict handling.
//
// How it works:
// - local quotes stored in localStorage (STORAGE_KEY)
// - simulated server (fakeServer) by default; can toggle to use real server via SERVER_URL
// - periodic polling calls syncWithServer(); server takes precedence on conflicts
// - conflicts are recorded and shown with actions (restore local / push local)
// - basic import/export, category filter, add-quote form included

// ---------- Config ----------
const STORAGE_KEY = 'dqg_quotes_sync_v1';
const POLL_INTERVAL_MS = 15000; // 15 seconds (configurable)
const DEFAULT_SERVER_URL = '';   // if you have a real server, set here or via UI

// ---------- Helpers ----------
function safeParseJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
function nowISO() { return new Date().toISOString(); }
function generateId() { return 'id-' + Date.now() + '-' + Math.floor(Math.random()*1000); }
function cmpTime(aIso, bIso) { return new Date(aIso).getTime() - new Date(bIso).getTime(); }

// ---------- Default quotes (with id, updatedAt) ----------
const DEFAULT_QUOTES = [
  { id: 'q-1', text: "The best way to get started is to quit talking and begin doing.", category: "Motivation", updatedAt: nowISO() },
  { id: 'q-2', text: "Life is what happens when you're busy making other plans.", category: "Life", updatedAt: nowISO() },
  { id: 'q-3', text: "Do not let making a living prevent you from making a life.", category: "Wisdom", updatedAt: nowISO() },
  { id: 'q-4', text: "Success is not the key to happiness. Happiness is the key to success.", category: "Happiness", updatedAt: nowISO() }
];

// ---------- State ----------
let quotes = [];
let conflicts = []; // { id, local, server, resolved:false }
let pollTimer = null;

// ---------- DOM refs ----------
const quoteDisplay = document.getElementById('quoteDisplay');
const categoryFilter = document.getElementById('categoryFilter');
const btnNewQuote = document.getElementById('newQuote');
const btnExport = document.getElementById('exportQuotes');
const btnImport = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFile');
const formArea = document.getElementById('formArea');

const btnSyncNow = document.getElementById('syncNowBtn');
const btnPushLocal = document.getElementById('pushLocalBtn');
const chkSimulate = document.getElementById('simulateServer');
const inputServerUrl = document.getElementById('serverUrl');

const syncStatus = document.getElementById('syncStatus');
const conflictList = document.getElementById('conflictList');
const pollIntervalLabel = document.getElementById('pollIntervalLabel');

// ---------- Storage helpers ----------
function saveQuotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}
function loadQuotes() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    quotes = DEFAULT_QUOTES.map(q => ({ ...q })); // clones with updatedAt
    saveQuotes();
    return;
  }
  const parsed = safeParseJSON(raw, null);
  if (Array.isArray(parsed)) {
    // basic validation
    quotes = parsed.filter(q => q && typeof q.text === 'string' && typeof q.category === 'string')
                   .map(q => ({ id: q.id || generateId(), text: q.text, category: q.category, updatedAt: q.updatedAt || nowISO() }));
  } else {
    quotes = DEFAULT_QUOTES.map(q => ({ ...q }));
    saveQuotes();
  }
}

// ---------- UI: categories & display ----------
function populateCategories() {
  const cats = [...new Set(quotes.map(q => q.category))].sort();
  categoryFilter.innerHTML = '';
  const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'All Categories';
  categoryFilter.appendChild(optAll);
  cats.forEach(cat => {
    const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });

  // restore last selected filter from local storage
  const lastFilter = localStorage.getItem('dqg_selectedFilter_v1');
  if (lastFilter && (lastFilter === 'all' || cats.includes(lastFilter))) categoryFilter.value = lastFilter;
}

function displayQuote(obj) {
  if (!obj) {
    quoteDisplay.textContent = 'No quote to display.';
    return;
  }
  quoteDisplay.textContent = `"${obj.text}" — [${obj.category}]`;
  // remember last viewed in session
  sessionStorage.setItem('dqg_lastViewed_v1', JSON.stringify(obj));
}

function showRandomQuote() {
  const sel = categoryFilter.value;
  const pool = sel === 'all' ? quotes : quotes.filter(q => q.category === sel);
  if (!pool || pool.length === 0) { quoteDisplay.textContent = 'No quotes in this category.'; return; }
  const idx = Math.floor(Math.random() * pool.length);
  displayQuote(pool[idx]);
}

// remember filter selection
categoryFilter.addEventListener('change', () => {
  localStorage.setItem('dqg_selectedFilter_v1', categoryFilter.value);
  showRandomQuote();
});

// ---------- Add quote form (dynamically created) ----------
function createAddQuoteForm() {
  const container = document.createElement('div');
  container.className = 'panel';
  const h = document.createElement('h3'); h.textContent = 'Add a New Quote'; container.appendChild(h);

  const inputText = document.createElement('input'); inputText.id = 'newQuoteText'; inputText.placeholder = 'Enter a new quote'; inputText.style.width = '100%'; inputText.style.marginBottom = '8px';
  const inputCat  = document.createElement('input'); inputCat.id = 'newQuoteCategory'; inputCat.placeholder = 'Enter quote category'; inputCat.style.width = '100%'; inputCat.style.marginBottom = '8px';
  const addBtn = document.createElement('button'); addBtn.textContent = 'Add Quote';

  addBtn.addEventListener('click', () => {
    const text = inputText.value.trim();
    const category = inputCat.value.trim();
    if (!text || !category) { alert('Please enter both text and category.'); return; }
    const newQ = { id: generateId(), text, category, updatedAt: nowISO() };
    quotes.push(newQ);
    saveQuotes();
    populateCategories();
    inputText.value = ''; inputCat.value = '';
    alert('Quote added locally and persisted to localStorage.');
  });

  container.appendChild(inputText);
  container.appendChild(inputCat);
  container.appendChild(addBtn);
  formArea.appendChild(container);
}

// ---------- Export / Import ----------
function exportQuotes() {
  const blob = new Blob([JSON.stringify(quotes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `quotes-export-${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFromJsonFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let imported = safeParseJSON(e.target.result, null);
    if (!Array.isArray(imported)) { alert('Imported JSON must be an array of quote objects.'); importFileInput.value=''; return; }
    let added = 0;
    imported.forEach(obj => {
      if (obj && typeof obj.text === 'string' && typeof obj.category === 'string') {
        const candidate = { id: obj.id || generateId(), text: obj.text, category: obj.category, updatedAt: obj.updatedAt || nowISO() };
        // skip exact duplicate text+category
        if (!quotes.some(q => q.text === candidate.text && q.category === candidate.category)) {
          quotes.push(candidate); added++;
        }
      }
    });
    saveQuotes(); populateCategories();
    alert(`Import finished. ${added} new quote(s) added.`);
    importFileInput.value = '';
  };
  reader.readAsText(file);
}

// ---------- Fake server (simulation) ----------
const fakeServer = (function() {
  // server-side quote store
  let serverQuotes = DEFAULT_QUOTES.map(q => ({ ...q, id: q.id, updatedAt: q.updatedAt }));

  // helper: occasionally mutate server to create a "remote update"
  function randomServerMutation() {
    if (serverQuotes.length === 0) return;
    const idx = Math.floor(Math.random() * serverQuotes.length);
    serverQuotes[idx] = {
      ...serverQuotes[idx],
      text: serverQuotes[idx].text + ' (server edited)',
      updatedAt: new Date(Date.now() + Math.floor(Math.random()*1000)).toISOString()
    };
  }

  return {
    // Fetch all quotes (simulate latency)
    fetchQuotes() {
      return new Promise(resolve => {
        setTimeout(() => {
          // sometimes mutate so client can see changes
          if (Math.random() < 0.25) randomServerMutation();
          // return deep copy
          resolve(serverQuotes.map(q => ({ ...q })));
        }, 400 + Math.random()*600); // 400-1000ms latency
      });
    },

    // Push a quote to server (create or update)
    pushQuote(quote) {
      return new Promise(resolve => {
        setTimeout(() => {
          if (!quote.id || !serverQuotes.some(sq => sq.id === quote.id)) {
            // create new
            const newObj = { ...quote, id: generateId(), updatedAt: nowISO() };
            serverQuotes.push(newObj);
            resolve({ ...newObj });
          } else {
            // update existing
            serverQuotes = serverQuotes.map(sq => sq.id === quote.id ? { ...quote, updatedAt: nowISO() } : sq);
            resolve({ ...serverQuotes.find(sq => sq.id === quote.id) });
          }
        }, 300 + Math.random()*500);
      });
    }
  };
})();

// ---------- Server communication (switches between fakeServer and real server) ----------
// Simulate fetching quotes from server
async function fetchQuotesFromServer() {
  try {
    // Example using JSONPlaceholder (replace with your real endpoint)
    const response = await fetch("https://jsonplaceholder.typicode.com/posts?_limit=5");
    const serverData = await response.json();

    // Convert server data into our quote format
    const serverQuotes = serverData.map(post => ({
      text: post.title,
      category: "server"
    }));

    // Conflict resolution: server data takes precedence
    const combinedQuotes = mergeQuotesWithServer(serverQuotes, quotes);
    quotes = combinedQuotes;
    saveQuotes();
    populateCategories();
    console.log("Quotes synced from server.");
  } catch (error) {
    console.error("Error fetching quotes from server:", error);
  }
}

// Merge local and server quotes, preferring server in case of conflict
function mergeQuotesWithServer(serverQuotes, localQuotes) {
  const allQuotes = [...serverQuotes];

  localQuotes.forEach(localQuote => {
    const existsOnServer = serverQuotes.some(
      sq => sq.text === localQuote.text && sq.category === localQuote.category
    );
    if (!existsOnServer) {
      allQuotes.push(localQuote);
    }
  });

  return allQuotes;
}

// Periodic sync every 60 seconds
setInterval(fetchQuotesFromServer, 60000);

async function fetchServerQuotes() {
  if (chkSimulate.checked) {
    return fakeServer.fetchQuotes();
  }

  const base = inputServerUrl.value.trim() || DEFAULT_SERVER_URL;
  if (!base) throw new Error('No server URL configured and simulation is disabled.');

  // assume GET base + '/quotes' returns array of quote objects
  const url = base.replace(/\/$/, '') + '/quotes';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch from server: ' + resp.status);
  const data = await resp.json();
  // best-effort mapping: if server returns posts with {title, body}, map to category/title
  if (Array.isArray(data) && data.length && data[0].body && data[0].title) {
    // map: body -> text, title -> category
    return data.map(p => ({ id: p.id, text: p.body, category: p.title.slice(0, 30) || 'Uncategorized', updatedAt: p.updatedAt || nowISO() }));
  }
  return data;
}

async function pushQuoteToServer(quote) {
  if (chkSimulate.checked) {
    return fakeServer.pushQuote(quote);
  }
  const base = inputServerUrl.value.trim() || DEFAULT_SERVER_URL;
  if (!base) throw new Error('No server URL configured and simulation is disabled.');

  // create/PUT logic: if quote.id, try PUT, else POST
  if (!quote.id) {
    // POST
    const resp = await fetch(base + '/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quote)
    });
    return resp.json();
  } else {
    const resp = await fetch(base + '/quotes/' + quote.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quote)
    });
    return resp.json();
  }
}

// ---------- Sync logic (server wins on conflict) ----------
async function syncWithServer() {
  try {
    updateSyncStatus('Syncing...');
    const serverList = await fetchServerQuotes();

    // Build maps by id if present, otherwise by text+category fallback
    const serverByKey = new Map();
    serverList.forEach(sq => {
      const key = sq.id ? `id:${sq.id}` : `textcat:${sq.text}|||${sq.category}`;
      serverByKey.set(key, { ...sq });
    });

    const localByKey = new Map();
    quotes.forEach(lq => {
      const key = lq.id ? `id:${lq.id}` : `textcat:${lq.text}|||${lq.category}`;
      localByKey.set(key, { ...lq });
    });

    let changes = 0;
    const newConflicts = [];

    // apply server items into local (server precedence)
    serverByKey.forEach((serverQ, key) => {
      const localQ = localByKey.get(key);
      if (!localQ) {
        // server-only: add to local
        quotes.push({
          id: serverQ.id || generateId(),
          text: serverQ.text,
          category: serverQ.category,
          updatedAt: serverQ.updatedAt || nowISO()
        });
        changes++;
      } else {
        // both exist: check if they differ
        const differs = (localQ.text !== serverQ.text) || (localQ.category !== serverQ.category) || (localQ.updatedAt !== serverQ.updatedAt);
        if (differs) {
          // Record conflict (we will apply server version immediately as "server precedence")
          newConflicts.push({ id: key, local: localQ, server: serverQ, resolved: false });
          // Overwrite local with server version (server wins)
          const idx = quotes.findIndex(q => (q.id && serverQ.id && q.id === serverQ.id) || (q.text === localQ.text && q.category === localQ.category));
          if (idx >= 0) {
            quotes[idx] = {
              id: serverQ.id || generateId(),
              text: serverQ.text,
              category: serverQ.category,
              updatedAt: serverQ.updatedAt || nowISO()
            };
            changes++;
          }
        }
      }
    });

    // (Optional) local-only items are kept as-is (they can be pushed by user or automatically)
    // here we leave them and mark them as "not on server" so user may later push them.

    // Save local updates
    if (changes > 0) saveQuotes();
    // merge new conflicts into conflicts state
    if (newConflicts.length > 0) {
      conflicts = conflicts.concat(newConflicts);
      // Keep conflicts in sessionStorage so they persist during the tab session
      sessionStorage.setItem('dqg_conflicts_v1', JSON.stringify(conflicts));
    }
    populateCategories();
    updateSyncStatus(`Synced. Server items: ${serverList.length}. Conflicts detected: ${newConflicts.length}`);
    renderConflicts();
  } catch (err) {
    console.error('Sync error', err);
    updateSyncStatus('Sync failed: ' + (err.message || err));
  }
}

// ---------- Conflict UI / actions ----------
function loadConflictsFromSession() {
  const raw = sessionStorage.getItem('dqg_conflicts_v1');
  const parsed = safeParseJSON(raw, []);
  if (Array.isArray(parsed)) conflicts = parsed;
}

function renderConflicts() {
  if (!conflicts || conflicts.length === 0) {
    conflictList.innerHTML = '<div class="muted">No conflicts.</div>';
    return;
  }
  conflictList.innerHTML = '';
  conflicts.forEach((c, idx) => {
    const wrap = document.createElement('div'); wrap.className = 'conflict';

    const title = document.createElement('div'); title.innerHTML = `<strong>Conflict #${idx + 1}</strong> <span class="muted"> (server wins automatically)</span>`;
    const localDiv = document.createElement('div'); localDiv.innerHTML = `<em>Local:</em> "${escapeHtml(c.local.text)}" — [${escapeHtml(c.local.category)}]`;
    const serverDiv = document.createElement('div'); serverDiv.innerHTML = `<em>Server:</em> "${escapeHtml(c.server.text)}" — [${escapeHtml(c.server.category)}]`;

    const actions = document.createElement('div'); actions.style.marginTop = '6px';
    const btnKeepServer = document.createElement('button'); btnKeepServer.textContent = 'Keep Server Version'; btnKeepServer.style.marginRight = '8px';
    btnKeepServer.addEventListener('click', () => {
      // server is already applied; simply mark resolved and drop conflict
      conflicts.splice(conflicts.indexOf(c), 1);
      sessionStorage.setItem('dqg_conflicts_v1', JSON.stringify(conflicts));
      renderConflicts();
      updateSyncStatus('Conflict resolved (server version kept).');
    });

    const btnRestoreLocal = document.createElement('button'); btnRestoreLocal.textContent = 'Restore Local & Push'; btnRestoreLocal.className = 'secondary';
    btnRestoreLocal.addEventListener('click', async () => {
      // restore local version into local store
      const local = c.local;
      // find index in local quotes; try by id first
      const idxLocal = quotes.findIndex(q => q.id && local.id && q.id === local.id);
      if (idxLocal >= 0) {
        quotes[idxLocal] = { ...local, updatedAt: nowISO() };
      } else {
        // add local back
        quotes.push({ ...local, id: local.id || generateId(), updatedAt: nowISO() });
      }
      saveQuotes(); populateCategories();

      // push the restored/local object to server
      try {
        updateSyncStatus('Pushing restored local version to server...');
        const pushed = await pushQuoteToServer(quotes.find(q => q.id === (local.id || quotes[quotes.length-1].id)));
        // reconcile ids (server may assign new id)
        const localIndex = quotes.findIndex(q => q.id === (local.id || pushed.id));
        if (localIndex >= 0) quotes[localIndex] = { ...pushed }; // trust server response
        saveQuotes(); populateCategories();
        // clear conflict
        conflicts.splice(conflicts.indexOf(c), 1);
        sessionStorage.setItem('dqg_conflicts_v1', JSON.stringify(conflicts));
        renderConflicts();
        updateSyncStatus('Local version restored and pushed to server.');
      } catch (err) {
        console.error('Push restore failed', err);
        updateSyncStatus('Failed to push restored local version: ' + (err.message || err));
        alert('Failed to push restored local version to server.');
      }
    });

    actions.appendChild(btnKeepServer);
    actions.appendChild(btnRestoreLocal);

    wrap.appendChild(title);
    wrap.appendChild(localDiv);
    wrap.appendChild(serverDiv);
    wrap.appendChild(actions);
    conflictList.appendChild(wrap);
  });
}

// ---------- Push all local items that are not on server or are newer  ----------
async function pushAllLocalToServer() {
  updateSyncStatus('Pushing local items to server...');
  try {
    // fetch server list first to determine presence (if using a real server, fetch)
    const serverList = await fetchServerQuotes();
    const serverIds = new Set(serverList.map(s => s.id).filter(Boolean));
    let pushed = 0;
    for (const localQ of quotes) {
      // if server doesn't have it (no id in server) or local is newer than server's version, push
      const serverSame = serverList.find(s => s.id && localQ.id && s.id === localQ.id);
      let doPush = false;
      if (!serverSame) doPush = true;
      else if (cmpTime(localQ.updatedAt, serverSame.updatedAt) > 0) doPush = true;

      if (doPush) {
        const resp = await pushQuoteToServer(localQ);
        // update local with returned server response (id, updatedAt may change)
        const idx = quotes.findIndex(q => q.id === localQ.id);
        if (idx >= 0) quotes[idx] = { id: resp.id || localQ.id, text: resp.text, category: resp.category, updatedAt: resp.updatedAt || nowISO() };
        pushed++;
      }
    }
    saveQuotes(); populateCategories();
    updateSyncStatus(`Push completed. ${pushed} item(s) pushed/updated on server.`);
  } catch (err) {
    console.error('Push all failed', err);
    updateSyncStatus('Push failed: ' + (err.message || err));
  }
}

// ---------- Utility / UI helpers ----------
function updateSyncStatus(msg) {
  syncStatus.textContent = msg + ' (' + new Date().toLocaleTimeString() + ')';
}

// escape simple HTML for display
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// ---------- Init / Start polling ----------
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    syncWithServer();
  }, POLL_INTERVAL_MS);
  pollIntervalLabel.textContent = (POLL_INTERVAL_MS / 1000) + 's';
}

// ---------- Load session conflicts ----------
function initConflicts() {
  loadConflictsFromSession();
  renderConflicts();
}

// ---------- Wiring up UI events ----------
btnNewQuote.addEventListener('click', showRandomQuote);
btnExport.addEventListener('click', exportQuotes);
btnImport.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', importFromJsonFile);
btnSyncNow.addEventListener('click', () => syncWithServer());
btnPushLocal.addEventListener('click', () => pushAllLocalToServer());

// allow toggling simulation checkbox to change behavior; also allow manual server URL
chkSimulate.addEventListener('change', () => {
  const simText = chkSimulate.checked ? 'Simulated' : 'Real';
  updateSyncStatus(`Using ${simText} server mode.`);
});

// ---------- Boot sequence ----------
function init() {
  loadQuotes();
  populateCategories();
  createAddQuoteForm();

  // show last viewed if present
  const last = safeParseJSON(sessionStorage.getItem('dqg_lastViewed_v1'), null);
  if (last) displayQuote(last);

  initConflicts();
  startPolling();

  // initial sync after short delay
  setTimeout(() => syncWithServer(), 1000);
}

init();
