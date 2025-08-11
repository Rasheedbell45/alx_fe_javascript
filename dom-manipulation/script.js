// script.js
// Dynamic Quote Generator with localStorage, sessionStorage, JSON import/export,
// and dynamic form creation via createAddQuoteForm().

// ---------- Configuration ----------
const STORAGE_KEY = 'dqg_quotes_v1';
const LAST_QUOTE_KEY = 'dqg_lastQuote_v1';
const DEFAULT_QUOTES = [
  { text: "The best way to get started is to quit talking and begin doing.", category: "Motivation" },
  { text: "Life is what happens when you're busy making other plans.", category: "Life" },
  { text: "Do not let making a living prevent you from making a life.", category: "Wisdom" },
  { text: "Success is not the key to happiness. Happiness is the key to success.", category: "Happiness" }
];

// ---------- State ----------
let quotes = [];

// ---------- DOM references ----------
const quoteDisplay = document.getElementById('quoteDisplay');
const categorySelect = document.getElementById('categorySelect');
const btnShowNew = document.getElementById('newQuote');
const btnExport = document.getElementById('exportBtn');
const btnImport = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFile');
const replaceOnImport = document.getElementById('replaceOnImport');
const btnShowLast = document.getElementById('showLastQuoteBtn');
const formArea = document.getElementById('formArea');

// ---------- Helpers ----------
function safeParseJSON(str, fallback = null) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function nowTimestampForFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isValidQuoteObject(obj) {
  return obj && typeof obj.text === 'string' && obj.text.trim() !== '' &&
         typeof obj.category === 'string' && obj.category.trim() !== '';
}

function quoteExists(candidate) {
  return quotes.some(q => q.text === candidate.text && q.category === candidate.category);
}

// ---------- Storage: localStorage for persistent quotes ----------
function saveQuotes() {
  localStorage.setItem("quotes", JSON.stringify(quotes));
} catch (err) {
    console.error('Failed to save quotes to localStorage:', err);
    alert('Warning: Could not save quotes to localStorage.');
  }
}

function loadQuotes() {
  const storedQuotes = localStorage.getItem("quotes");
  if (storedQuotes) {
    quotes = JSON.parse(storedQuotes);
  }
}

// Export quotes to JSON file
function exportQuotes() {
  const dataStr = JSON.stringify(quotes, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "quotes.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// Dynamically create export button
function createExportButton() {
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export Quotes";
  exportBtn.addEventListener("click", exportQuotes);
  document.body.appendChild(exportBtn);
}
// ---------- sessionStorage: store last viewed quote (temporary) ----------
function persistLastViewedQuote(quoteObj) {
  try {
    sessionStorage.setItem(LAST_QUOTE_KEY, JSON.stringify(quoteObj));
  } catch (err) {
    console.warn('sessionStorage not available:', err);
  }
}

function getLastViewedQuote() {
  const raw = sessionStorage.getItem(LAST_QUOTE_KEY);
  if (!raw) return null;
  return safeParseJSON(raw, null);
}

// ---------- UI updates ----------
function populateCategories() {
  // compute distinct categories
  const categories = [...new Set(quotes.map(q => q.category))].sort();
  // clear and rebuild options
  categorySelect.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'All Categories';
  categorySelect.appendChild(optAll);
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

function displayQuote(quoteObj) {
  // Use textContent to avoid XSS
  quoteDisplay.textContent = `"${quoteObj.text}" — [${quoteObj.category}]`;
  persistLastViewedQuote(quoteObj);
}

// ---------- Quote actions ----------
function showRandomQuote() {
  const sel = categorySelect.value;
  const pool = sel === 'all' ? quotes : quotes.filter(q => q.category === sel);
  if (!pool || pool.length === 0) {
    quoteDisplay.textContent = 'No quotes available for the selected category.';
    return;
  }
  const idx = Math.floor(Math.random() * pool.length);
  displayQuote(pool[idx]);
}

function showLastViewed() {
  const last = getLastViewedQuote();
  if (!last) {
    alert('No last viewed quote in this session.');
    return;
  }
  displayQuote(last);
}

// addQuote uses inputs created by createAddQuoteForm (ids: newQuoteText, newQuoteCategory)
function addQuote() {
  const textInput = document.getElementById('newQuoteText');
  const categoryInput = document.getElementById('newQuoteCategory');

  if (!textInput || !categoryInput) {
    alert('Form inputs not found.');
    return;
  }

  const text = textInput.value.trim();
  const category = categoryInput.value.trim();

  if (!text || !category) {
    alert('Please fill in both quote text and category.');
    return;
  }

  const newQ = { text, category };
  if (quoteExists(newQ)) {
    alert('This quote already exists (same text & category).');
    // still clear inputs for convenience
    textInput.value = '';
    categoryInput.value = '';
    return;
  }

  quotes.push(newQ);
  saveQuotes();
  populateCategories();

  // Clear inputs and show confirmation
  textInput.value = '';
  categoryInput.value = '';
  alert('Quote added and saved to localStorage.');
}

// ---------- JSON Export ----------
function exportQuotes() {
  const json = JSON.stringify(quotes, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quotes-${nowTimestampForFilename()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- JSON Import ----------
function importFromJsonFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let imported;
    try {
      imported = JSON.parse(e.target.result);
    } catch (err) {
      alert('Invalid JSON. Please provide a valid JSON array of quote objects.');
      return;
    }
    if (!Array.isArray(imported)) {
      alert('Imported JSON must be an array of objects: [{ "text": "...", "category": "..." }, ...]');
      return;
    }

    // Validate items and prepare list of valid ones
    const valid = imported.filter(isValidQuoteObject);
    if (valid.length === 0) {
      alert('No valid quote objects found in the file.');
      return;
    }

    if (replaceOnImport.checked) {
      // Replace existing quotes
      quotes = valid;
      saveQuotes();
      populateCategories();
      alert(`Imported ${valid.length} quote(s) and replaced existing data.`);
    } else {
      // Merge, skipping duplicates
      let added = 0;
      valid.forEach(q => {
        if (!quoteExists(q)) {
          quotes.push(q);
          added += 1;
        }
      });
      if (added > 0) {
        saveQuotes();
        populateCategories();
      }
      alert(`Imported ${valid.length} quote(s). ${added} were added (new).`);
    }

    // clear the input so the same file can be imported again if needed
    importFileInput.value = '';
  };

  reader.onerror = function() {
    alert('Failed to read file.');
  };

  reader.readAsText(file);
}

// ---------- Dynamic form creation ----------
function createAddQuoteForm() {
  // form container
  const container = document.createElement('div');
  container.className = 'panel';
  container.id = 'addQuotePanel';

  const heading = document.createElement('h3');
  heading.textContent = 'Add a New Quote';
  heading.style.marginTop = '0';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.id = 'newQuoteText';
  textInput.placeholder = 'Enter a new quote';
  textInput.style.display = 'block';
  textInput.style.width = '100%';
  textInput.style.marginBottom = '8px';

  const categoryInput = document.createElement('input');
  categoryInput.type = 'text';
  categoryInput.id = 'newQuoteCategory';
  categoryInput.placeholder = 'Enter quote category (e.g., Motivation)';
  categoryInput.style.display = 'block';
  categoryInput.style.width = '100%';
  categoryInput.style.marginBottom = '8px';

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add Quote';
  addBtn.addEventListener('click', addQuote);

  container.appendChild(heading);
  container.appendChild(textInput);
  container.appendChild(categoryInput);
  container.appendChild(addBtn);

  formArea.appendChild(container);
}

// ---------- Initialization ----------
function init() {
  // load existing quotes from localStorage (or defaults)
  loadQuotes();
  populateCategories();
  createAddQuoteForm();
  createExportButton();

  // wire basic controls
  btnShowNew.addEventListener('click', showRandomQuote);
  categorySelect.addEventListener('change', showRandomQuote);
  btnExport.addEventListener('click', exportQuotes);
  btnImport.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importFromJsonFile);
  btnShowLast.addEventListener('click', showLastViewed);

  // If there's a last viewed quote in session, show it on load (optional)
  const last = getLastViewedQuote();
  if (last && isValidQuoteObject(last)) {
    // show it but do not overwrite session storage (persistLastViewedQuote has been called whenever shown)
    displayQuote(last);
  } else {
    // initial placeholder (no last viewed)
    quoteDisplay.textContent = 'Click "Show New Quote" to display a random quote.';
  }
}

// run
init();
