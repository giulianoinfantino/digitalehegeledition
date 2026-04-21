
// Wissenschaftliche Volltextsuche für Hegels Logik
// Unterstützt: Phrasen, Boolean (AND/OR/NOT), Wildcards, Regex, Proximity,
// Filter, Kapitelgruppierung, URL-State, mehrfarbige Highlights.

(async function() {
  const form = document.getElementById('search-form');
  if (!form) return;

  const queryInput  = document.getElementById('search-query');
  const statusEl    = document.getElementById('search-status');
  const summaryEl   = document.getElementById('search-summary');
  const resultsEl   = document.getElementById('search-results');
  const resetBtn    = document.getElementById('search-reset');
  const caseCB      = document.getElementById('opt-case');
  const wordCB      = document.getElementById('opt-wholeword');
  const diaCB       = document.getElementById('opt-diacritics');
  const gwFrom      = document.getElementById('gw-from');
  const gwTo        = document.getElementById('gw-to');
  const contextSize = document.getElementById('context-size');
  const chapCBs     = document.getElementById('chapter-checkboxes');
  const chapToggle  = document.getElementById('chapters-toggle');

  let data = null;
  let chapterIndex = null;  // {id, title, para_start, para_end}[]

  // ============ Index & Kapitel laden ============
  try {
    statusEl.textContent = 'Index wird geladen …';
    const r = await fetch('data/paragraphs.json');
    data = await r.json();
    const rc = await fetch('data/chapters.json');
    chapterIndex = await rc.json();
    statusEl.textContent = data.length + ' Absätze durchsuchbar.';
  } catch (e) {
    statusEl.textContent = 'Fehler beim Laden: ' + e.message;
    return;
  }

  // Kapitel-Checkboxes bauen
  chapterIndex.forEach(chap => {
    const label = document.createElement('label');
    label.innerHTML =
      '<input type="checkbox" class="chap-cb" value="' + chap.id + '" checked>' +
      '<span class="chap-name">' + escapeHtml(chap.title) + '</span>' +
      '<span class="chap-match-count" data-chap="' + chap.id + '"></span>';
    chapCBs.appendChild(label);
  });

  // ============ Normalisierung ============
  function stripDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function normalize(s, caseSensitive, stripDia) {
    let t = s;
    if (!caseSensitive) t = t.toLowerCase();
    if (stripDia) t = stripDiacritics(t);
    return t;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============ Query-Parser ============
  // Erzeugt AST aus der Suchanfrage.
  // Tokens: WORD (inkl. wildcard), PHRASE, REGEX, AND, OR, NOT, LPAREN, RPAREN, PROXIMITY (~N)
  //
  // Grammatik:
  //   expr    = or_expr
  //   or_expr = and_expr ( OR and_expr )*
  //   and_expr= not_expr ( AND? not_expr )*
  //   not_expr= NOT? atom ( PROXIMITY atom )?
  //   atom    = LPAREN or_expr RPAREN | TERM

  function tokenize(q) {
    const tokens = [];
    let i = 0;
    while (i < q.length) {
      const c = q[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(') { tokens.push({type:'LPAREN'}); i++; continue; }
      if (c === ')') { tokens.push({type:'RPAREN'}); i++; continue; }
      if (c === '"') {
        // Phrase
        let j = i + 1;
        while (j < q.length && q[j] !== '"') j++;
        tokens.push({type:'TERM', kind:'phrase', value: q.slice(i+1, j)});
        i = j + 1;
        continue;
      }
      if (c === '/') {
        // Regex bis zum nächsten unescaped /
        let j = i + 1;
        while (j < q.length) {
          if (q[j] === '\\') { j += 2; continue; }
          if (q[j] === '/') break;
          j++;
        }
        const flags = (q[j+1] === 'i' || q[j+1] === 'g' || q[j+1] === 's') ? q[j+1] : '';
        tokens.push({type:'TERM', kind:'regex', value: q.slice(i+1, j), flags});
        i = j + 1 + (flags ? 1 : 0);
        continue;
      }
      if (c === '-' && (i === 0 || /[\s(]/.test(q[i-1]))) {
        tokens.push({type:'NOT'});
        i++;
        continue;
      }
      if (c === '~') {
        // Proximity ~N
        let j = i + 1;
        while (j < q.length && /\d/.test(q[j])) j++;
        const n = parseInt(q.slice(i+1, j), 10);
        if (!isNaN(n)) {
          tokens.push({type:'PROXIMITY', value: n});
          i = j;
          continue;
        }
        i++;
        continue;
      }
      // Wort / Schlüsselwort / Wildcard
      let j = i;
      while (j < q.length && !/[\s()"]/.test(q[j])) j++;
      const word = q.slice(i, j);
      const upper = word.toUpperCase();
      if (upper === 'AND' || upper === '+' || word === '+') {
        tokens.push({type:'AND'});
      } else if (upper === 'OR' || upper === '|' || word === '|') {
        tokens.push({type:'OR'});
      } else if (upper === 'NOT') {
        tokens.push({type:'NOT'});
      } else {
        const kind = word.includes('*') || word.includes('?') ? 'wildcard' : 'word';
        tokens.push({type:'TERM', kind, value: word});
      }
      i = j;
    }
    return tokens;
  }

  function parse(tokens) {
    let pos = 0;
    function peek() { return tokens[pos]; }
    function consume(type) {
      if (tokens[pos] && tokens[pos].type === type) return tokens[pos++];
      return null;
    }
    function parseOr() {
      let left = parseAnd();
      while (consume('OR')) {
        const right = parseAnd();
        left = {op: 'OR', children: [left, right]};
      }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek() && peek().type !== 'OR' && peek().type !== 'RPAREN') {
        if (peek().type === 'AND') pos++;
        const right = parseNot();
        if (!right) break;
        left = {op: 'AND', children: [left, right]};
      }
      return left;
    }
    function parseNot() {
      if (consume('NOT')) {
        const child = parseAtom();
        return {op:'NOT', child};
      }
      const atom = parseAtom();
      // Proximity-Check
      if (atom && peek() && peek().type === 'PROXIMITY') {
        const prox = consume('PROXIMITY');
        const right = parseAtom();
        if (right) {
          return {op:'PROXIMITY', distance: prox.value, left: atom, right};
        }
      }
      return atom;
    }
    function parseAtom() {
      if (consume('LPAREN')) {
        const e = parseOr();
        consume('RPAREN');
        return e;
      }
      const t = peek();
      if (t && t.type === 'TERM') { pos++; return {op:'TERM', term: t}; }
      return null;
    }
    return parseOr();
  }

  // ============ Matching ============
  // Erzeugt aus einem Term ein Regex + Flag "phrase/word/wildcard/regex"
  function termToRegex(termObj, opts) {
    const {caseSensitive, wholeWord, stripDia} = opts;
    const flags = (caseSensitive ? '' : 'i') + 'g';
    let pattern;
    if (termObj.kind === 'phrase') {
      pattern = termObj.value.split(/\s+/).map(escapeRegex).join('\\s+');
    } else if (termObj.kind === 'wildcard') {
      pattern = termObj.value
        .split('').map(ch => {
          if (ch === '*') return '\\S*';
          if (ch === '?') return '\\S';
          return escapeRegex(ch);
        }).join('');
    } else if (termObj.kind === 'regex') {
      pattern = termObj.value;
      try {
        return new RegExp(pattern, (termObj.flags || '') + 'g');
      } catch (e) { return null; }
    } else {
      pattern = escapeRegex(termObj.value);
    }
    if (wholeWord) pattern = '\\b' + pattern + '\\b';
    try { return new RegExp(pattern, flags); }
    catch (e) { return null; }
  }

  // Prüft, ob ein Absatz zum AST passt. Gibt Array aller Match-Positionen zurück
  // oder null bei NOT-Mismatch bzw. wenn keine Matches.
  function evaluateNode(node, text, opts, collector) {
    if (!node) return true;
    if (node.op === 'TERM') {
      const re = termToRegex(node.term, opts);
      if (!re) return false;
      let m; let found = false;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        collector.push({start: m.index, end: m.index + m[0].length, termIdx: node.termIdx || 0});
        found = true;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      return found;
    }
    if (node.op === 'AND') {
      const a = evaluateNode(node.children[0], text, opts, collector);
      const b = evaluateNode(node.children[1], text, opts, collector);
      return a && b;
    }
    if (node.op === 'OR') {
      const c0 = [...collector];
      const a = evaluateNode(node.children[0], text, opts, collector);
      if (a) {
        // zusätzlich rechten Zweig sammeln (für Highlights)
        evaluateNode(node.children[1], text, opts, collector);
        return true;
      }
      // Rollback Collector und versuche rechts
      collector.length = c0.length;
      return evaluateNode(node.children[1], text, opts, collector);
    }
    if (node.op === 'NOT') {
      const tmp = [];
      return !evaluateNode(node.child, text, opts, tmp);
    }
    if (node.op === 'PROXIMITY') {
      const leftMatches = [];
      const rightMatches = [];
      const leftOk = evaluateNode(node.left, text, opts, leftMatches);
      const rightOk = evaluateNode(node.right, text, opts, rightMatches);
      if (!leftOk || !rightOk) return false;
      // Token-basierte Distanz: wie viele Wörter zwischen den Matches
      const words = text.split(/\s+/);
      const wordPositions = [];
      let cursor = 0;
      for (const w of words) {
        const idx = text.indexOf(w, cursor);
        wordPositions.push({start: idx, end: idx + w.length});
        cursor = idx + w.length;
      }
      function wordIndex(pos) {
        for (let i = 0; i < wordPositions.length; i++) {
          if (pos >= wordPositions[i].start && pos <= wordPositions[i].end) return i;
        }
        return -1;
      }
      let closeEnough = false;
      for (const lm of leftMatches) {
        const lw = wordIndex(lm.start);
        for (const rm of rightMatches) {
          const rw = wordIndex(rm.start);
          if (lw >= 0 && rw >= 0 && Math.abs(lw - rw) <= node.distance) {
            closeEnough = true;
            collector.push(lm);
            collector.push(rm);
          }
        }
      }
      return closeEnough;
    }
    return false;
  }

  // Assigniert jedem TERM einen Index für verschiedene Markierungsfarben
  function indexTerms(node, counter) {
    if (!node) return counter;
    if (node.op === 'TERM') {
      node.termIdx = counter.n % 5;
      counter.n++;
    } else if (node.children) {
      node.children.forEach(c => indexTerms(c, counter));
    } else if (node.child) {
      indexTerms(node.child, counter);
    } else if (node.left) {
      indexTerms(node.left, counter);
      indexTerms(node.right, counter);
    }
    return counter;
  }

  // Sammelt alle Term-Objekte für Highlight-Rendering
  function collectTerms(node, arr) {
    if (!node) return arr;
    if (node.op === 'TERM') {
      if (node.term.kind !== 'regex' || true) arr.push(node);
    } else if (node.op === 'NOT') {
      // NOT-Terme NICHT in die Highlight-Liste aufnehmen
    } else if (node.children) {
      node.children.forEach(c => collectTerms(c, arr));
    } else if (node.left) {
      collectTerms(node.left, arr);
      collectTerms(node.right, arr);
    }
    return arr;
  }

  // ============ Highlight ============
  function highlightText(text, matches) {
    // matches: [{start, end, termIdx}]
    if (!matches.length) return escapeHtml(text);
    // Überschneidungen/Duplikate entfernen
    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const m of matches) {
      const last = merged[merged.length - 1];
      if (last && m.start < last.end) {
        last.end = Math.max(last.end, m.end);
      } else {
        merged.push({...m});
      }
    }
    let out = '';
    let cursor = 0;
    for (const m of merged) {
      out += escapeHtml(text.slice(cursor, m.start));
      out += '<mark class="m' + (m.termIdx || 0) + '">' + escapeHtml(text.slice(m.start, m.end)) + '</mark>';
      cursor = m.end;
    }
    out += escapeHtml(text.slice(cursor));
    return out;
  }

  function buildExcerpt(text, matches, contextChars) {
    if (!matches.length) {
      return escapeHtml(text.slice(0, contextChars * 2) + (text.length > contextChars * 2 ? '…' : ''));
    }
    // Fenster um jedes Match bauen, überlappende Fenster verschmelzen
    matches.sort((a, b) => a.start - b.start);
    const windows = [];
    for (const m of matches) {
      const start = Math.max(0, m.start - contextChars);
      const end = Math.min(text.length, m.end + contextChars);
      const last = windows[windows.length - 1];
      if (last && start <= last.end) {
        last.end = Math.max(last.end, end);
        last.matches.push(m);
      } else {
        windows.push({start, end, matches: [m]});
      }
    }
    // Maximum 3 Fenster zeigen
    const show = windows.slice(0, 3);
    const parts = show.map(w => {
      let segment = text.slice(w.start, w.end);
      const localMatches = w.matches.map(m => ({...m, start: m.start - w.start, end: m.end - w.start}));
      let rendered = highlightText(segment, localMatches);
      if (w.start > 0) rendered = '… ' + rendered;
      if (w.end < text.length) rendered += ' …';
      return rendered;
    });
    const suffix = windows.length > 3 ? ' <span class="more-windows">+' + (windows.length - 3) + ' weitere</span>' : '';
    return parts.join(' <span class="excerpt-sep">·</span> ') + suffix;
  }

  // ============ Kapitel-Zuordnung ============
  function chapterOfPara(pIdx) {
    for (const c of chapterIndex) {
      if (pIdx >= c.para_start && pIdx <= c.para_end) return c;
    }
    return null;
  }

  // ============ Hauptsuche ============
  let currentResults = [];

  function doSearch() {
    const q = queryInput.value.trim();
    summaryEl.innerHTML = '';
    if (!q) {
      resultsEl.innerHTML = '';
      statusEl.textContent = data.length + ' Absätze durchsuchbar.';
      updateChapterCounts({});
      updateURL();
      return;
    }

    const opts = {
      caseSensitive: caseCB.checked,
      wholeWord:     wordCB.checked,
      stripDia:      diaCB.checked,
    };
    const ctxSize = parseInt(contextSize.value, 10) || 80;

    // Query parsen
    let ast;
    try {
      const tokens = tokenize(q);
      ast = parse(tokens);
      indexTerms(ast, {n: 0});
    } catch (e) {
      statusEl.textContent = 'Syntaxfehler in Suchanfrage: ' + e.message;
      resultsEl.innerHTML = '';
      return;
    }
    if (!ast) {
      statusEl.textContent = 'Leere Suchanfrage.';
      resultsEl.innerHTML = '';
      return;
    }

    // Kapitel-Filter
    const activeChapters = new Set();
    document.querySelectorAll('.chap-cb:checked').forEach(cb => activeChapters.add(cb.value));
    const allChapsActive = activeChapters.size === chapterIndex.length;

    // Seiten-Filter
    const gwMin = parseInt(gwFrom.value, 10);
    const gwMax = parseInt(gwTo.value, 10);

    // Alle Absätze durchgehen
    const matches = [];
    const countsByChapter = {};

    for (const p of data) {
      // Diakritika-Behandlung: Der Text bleibt im Original, aber opts wird benutzt
      // für die Normalisierung IM Regex-Aufbau (Flag 'i').
      // Diakritika-strip wenden wir hier direkt auf Text + Regex an.
      let searchText = p.text;
      if (opts.stripDia) searchText = stripDiacritics(searchText);

      const collector = [];
      const ok = evaluateNode(ast, searchText, opts, collector);
      if (!ok) continue;

      // Kapitel bestimmen
      const chap = chapterOfPara(p.idx);
      const chapId = chap ? chap.id : '__other';

      if (!allChapsActive && !activeChapters.has(chapId)) continue;

      // GW-Seitenfilter
      if (!isNaN(gwMin) || !isNaN(gwMax)) {
        const gw = parseInt(p.meiner, 10);
        if (isNaN(gw)) continue;
        if (!isNaN(gwMin) && gw < gwMin) continue;
        if (!isNaN(gwMax) && gw > gwMax) continue;
      }

      // Treffer behalten
      // Collector enthält möglicherweise Duplikate — in buildExcerpt bereinigt
      matches.push({
        paragraph: p,
        matchPositions: collector,
        matchCount: collector.length,
        chapter: chap,
        excerpt: buildExcerpt(searchText, collector, ctxSize),
      });

      countsByChapter[chapId] = (countsByChapter[chapId] || 0) + 1;
    }

    currentResults = matches;
    statusEl.textContent = matches.length
      ? matches.length + ' Treffer in ' + Object.keys(countsByChapter).length + ' Kapiteln'
      : 'Keine Treffer für »' + q + '«';

    // Sortierung anwenden
    const sort = document.querySelector('input[name="sort"]:checked').value;
    if (sort === 'relevance') {
      matches.sort((a, b) => b.matchCount - a.matchCount);
    } else if (sort === 'chapter') {
      // nichts hier, wird beim Rendern gruppiert
    } else {
      matches.sort((a, b) => a.paragraph.idx - b.paragraph.idx);
    }

    // Summary (Chip-Leiste mit Kapitel-Treffern)
    summaryEl.innerHTML = '';
    const sortedChaps = chapterIndex.filter(c => countsByChapter[c.id]);
    sortedChaps.forEach(c => {
      const chip = document.createElement('a');
      chip.className = 'summary-chapter';
      chip.href = '#chap-' + c.id;
      chip.innerHTML = escapeHtml(c.title) + ' <span class="chap-count">' + countsByChapter[c.id] + '</span>';
      summaryEl.appendChild(chip);
    });

    // Rendern
    renderResults(matches, sort);
    updateChapterCounts(countsByChapter);
    updateURL();
  }

  function renderResults(matches, sort) {
    if (!matches.length) { resultsEl.innerHTML = ''; return; }

    if (sort === 'chapter') {
      // Gruppiert rendern
      const groups = {};
      for (const m of matches) {
        const cid = m.chapter ? m.chapter.id : '__other';
        if (!groups[cid]) groups[cid] = {chapter: m.chapter, matches: []};
        groups[cid].matches.push(m);
      }
      const ordered = chapterIndex
        .filter(c => groups[c.id])
        .map(c => groups[c.id]);
      resultsEl.innerHTML = ordered.map(g => `
        <div class="search-chapter-group" id="chap-${g.chapter.id}">
          <h3>${escapeHtml(g.chapter.title)} <span class="group-count">(${g.matches.length})</span></h3>
          ${g.matches.slice(0, 80).map(renderResult).join('')}
          ${g.matches.length > 80 ? '<p style="color:var(--ink-mute);font-family:var(--sans);font-size:0.82rem;margin-top:0.5rem;">(' + (g.matches.length - 80) + ' weitere Treffer in diesem Kapitel nicht angezeigt)</p>' : ''}
        </div>
      `).join('');
    } else {
      const limit = 200;
      resultsEl.innerHTML = matches.slice(0, limit).map(renderResult).join('');
      if (matches.length > limit) {
        resultsEl.insertAdjacentHTML('beforeend',
          '<p style="margin-top:1.5rem;color:var(--ink-mute);font-family:var(--sans);font-size:0.85rem;">' +
          (matches.length - limit) + ' weitere Treffer. Bitte Suche weiter einschränken.</p>');
      }
    }
  }

  function renderResult(m) {
    const p = m.paragraph;
    const chapName = m.chapter ? m.chapter.title : '';
    return `
      <div class="search-result">
        <div class="search-result-meta">
          <span>GW ${escapeHtml(String(p.meiner || '?'))}</span>
          <span>OA ${escapeHtml(String(p.gw || '?'))}</span>
          ${chapName ? '<span>' + escapeHtml(chapName) + '</span>' : ''}
          <span class="match-count">${m.matchCount} Treffer</span>
          <a href="text.html#p${p.idx}">Im Text öffnen →</a>
        </div>
        <p class="search-result-text">${m.excerpt}</p>
      </div>
    `;
  }

  // ============ Chapter counts in Sidebar ============
  function updateChapterCounts(counts) {
    document.querySelectorAll('.chap-match-count').forEach(el => {
      const cid = el.dataset.chap;
      const n = counts[cid] || 0;
      el.textContent = n > 0 ? '(' + n + ')' : '';
      el.classList.toggle('is-zero', n === 0);
    });
  }

  // ============ URL State ============
  function updateURL() {
    const params = new URLSearchParams();
    if (queryInput.value.trim()) params.set('q', queryInput.value.trim());
    if (caseCB.checked) params.set('case', '1');
    if (wordCB.checked) params.set('word', '1');
    if (diaCB.checked) params.set('dia', '1');
    if (gwFrom.value) params.set('gwfrom', gwFrom.value);
    if (gwTo.value) params.set('gwto', gwTo.value);
    const sort = document.querySelector('input[name="sort"]:checked');
    if (sort && sort.value !== 'position') params.set('sort', sort.value);
    const uncheckedChaps = [];
    document.querySelectorAll('.chap-cb').forEach(cb => { if (!cb.checked) uncheckedChaps.push(cb.value); });
    if (uncheckedChaps.length) params.set('nochap', uncheckedChaps.join(','));
    const s = params.toString();
    const newUrl = s ? '?' + s : window.location.pathname;
    history.replaceState(null, '', newUrl);
  }

  function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('q')) queryInput.value = params.get('q');
    caseCB.checked = params.get('case') === '1';
    wordCB.checked = params.get('word') === '1';
    diaCB.checked = params.get('dia') === '1';
    if (params.get('gwfrom')) gwFrom.value = params.get('gwfrom');
    if (params.get('gwto')) gwTo.value = params.get('gwto');
    const sort = params.get('sort');
    if (sort) {
      const radio = document.querySelector('input[name="sort"][value="' + sort + '"]');
      if (radio) radio.checked = true;
    }
    const noChap = params.get('nochap');
    if (noChap) {
      const uncheck = new Set(noChap.split(','));
      document.querySelectorAll('.chap-cb').forEach(cb => {
        if (uncheck.has(cb.value)) cb.checked = false;
      });
    }
  }

  // ============ Event-Handler ============
  form.addEventListener('submit', e => { e.preventDefault(); doSearch(); });
  queryInput.addEventListener('input', () => {
    clearTimeout(queryInput._t);
    queryInput._t = setTimeout(doSearch, 300);
  });

  [caseCB, wordCB, diaCB, gwFrom, gwTo, contextSize].forEach(el => {
    el.addEventListener('change', () => doSearch());
  });
  document.querySelectorAll('input[name="sort"]').forEach(r =>
    r.addEventListener('change', () => doSearch()));
  document.querySelectorAll('.chap-cb').forEach(cb =>
    cb.addEventListener('change', () => doSearch()));

  resetBtn.addEventListener('click', () => {
    queryInput.value = '';
    caseCB.checked = wordCB.checked = diaCB.checked = false;
    gwFrom.value = gwTo.value = '';
    document.querySelector('input[name="sort"][value="position"]').checked = true;
    document.querySelectorAll('.chap-cb').forEach(cb => cb.checked = true);
    contextSize.value = 80;
    doSearch();
    queryInput.focus();
  });

  chapToggle.addEventListener('click', () => {
    const boxes = document.querySelectorAll('.chap-cb');
    const anyUnchecked = Array.from(boxes).some(cb => !cb.checked);
    boxes.forEach(cb => { cb.checked = anyUnchecked; });
    doSearch();
  });

  // Initial-State aus URL laden
  loadFromURL();
  if (queryInput.value.trim()) {
    doSearch();
  }
})();
