(() => {
  // Server sync mode: auto-detect if served with backend
  let serverMode = false;
  const storageKeys = {
    doctors: 'eop_doctors',
    logs: 'eop_logs'
  };

  // State
  let doctors = load(storageKeys.doctors, []);
  let logs = load(storageKeys.logs, []);
  let sortSummary = { key: 'count', dir: 'desc' }; // or 'doctor'

  // Elements
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Tabs
  $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  function switchTab(name) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  }

  // Utilities
  function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function load(key, fallback){ try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch{ return fallback; } }
  const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);
  function actorParam(){ return operatorName ? `actor=${encodeURIComponent(operatorName)}` : ''; }
  // multi-facility features removed
  async function apiGet(path){ const r = await fetch(path, {credentials:'same-origin'}); if(!r.ok) throw new Error('GET '+path); return r.json(); }
  async function apiPost(path, body){ const payload = Object.assign({}, body||{}, operatorName ? {actor: operatorName} : {}); const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'same-origin'}); if(!r.ok) throw new Error('POST '+path); return r.json(); }
  async function apiDelete(path){ const r = await fetch(path, {method:'DELETE', credentials:'same-origin'}); if(!r.ok) throw new Error('DELETE '+path); return r.json(); }
  async function detectServer(){
    try{
      const res = await fetch('/api/ping', {method:'GET'});
      serverMode = res.ok;
      return serverMode;
    } catch { serverMode = false; return false; }
  }
  async function syncFromServer(){
    if (!serverMode) return;
    try{
      const d = await apiGet('/api/doctors');
      doctors = Array.isArray(d.doctors) ? d.doctors : [];
      const l = await apiGet('/api/logs');
      logs = Array.isArray(l.logs) ? l.logs : [];
      try {
        const fb = await apiGet('/api/fatigue-bands');
        if (Array.isArray(fb.bands)) { fatigueBands = fb.bands; }
      } catch {}
    } catch(e){ console.warn('Sync failed', e); }
  }
  // Normalize stored datetime to local wall-time Date
  function toLocalDate(stored){
    if (!stored) return new Date('invalid');
    const d = new Date(stored);
    if (typeof stored === 'string' && stored.endsWith('Z')){
      return new Date(d.getTime() + d.getTimezoneOffset()*60000);
    }
    return d;
  }

  const formatDate = (stored) => {
    const d = toLocalDate(stored);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  function formatLocalForStore(d){
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }
  const nowLocalDatetime = () => {
    const d = new Date();
    d.setSeconds(0,0);
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const monthStartDate = () => {
    const d = new Date();
    d.setDate(1); d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  };
  const todayDate = () => new Date().toISOString().slice(0,10);

  // DOM refs
  const doctorList = $('#doctor-list');
  const doctorManageList = $('#doctor-manage-list');
  const clearSelectionBtn = $('#clear-selection');
  const bulkDoctorsInput = $('#bulk-doctors');
  const bulkAddBtn = $('#bulk-add');
  const form = $('#log-form');
  const dtInput = $('#datetime');
  const noteInput = $('#note');
  const clearFormBtn = $('#clear-form');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const logsTableBody = $('#logs-table tbody');
  const searchFrom = $('#search-from');
  const searchTo = $('#search-to');
  const searchBtn = $('#search-logs');
  const searchResetBtn = $('#search-reset');
  const searchLogsBody = $('#search-logs-table tbody');
  const exportSearchCsvBtn = $('#export-search-csv');
  const summaryBody = $('#summary-table tbody');
  const summaryBody1w = $('#summary-table-1w tbody');
  const summaryBody1m = $('#summary-table-1m tbody');
  const summaryHeaders = $$('#summary-table th[data-sort]');
  const fromDate = $('#from-date');
  const toDate = $('#to-date');
  const applyFilterBtn = $('#apply-filter');
  const resetFilterBtn = $('#reset-filter');
  const statsLine = $('#stats-line');
  const chart = $('#chart');
  const chart1w = $('#chart-1w');
  const chart1m = $('#chart-1m');
  const statsLine1w = $('#stats-line-1w');
  const statsLine1m = $('#stats-line-1m');
  const exportCsvBtn = $('#export-csv');
  const importCsvInput = $('#import-csv');
  const clearLogsBtn = $('#clear-logs');
  // Fatigue tab elements
  const fatigueChart = $('#fatigue-chart');
  const fatigueBandsWrap = $('#fatigue-bands');
  const fatigueAddBandBtn = $('#fatigue-add-band');
  const fatigueResetBandsBtn = $('#fatigue-reset-bands');
  // Fatigue bands config (persist)
  const FATIGUE_BANDS_KEY = 'eop_fatigue_bands';
  function defaultBands(){ return [ {start:'17:00', end:'21:00', weight:1}, {start:'21:01', end:'09:00', weight:2} ]; }
  function loadBands(){ return load(FATIGUE_BANDS_KEY, defaultBands()); }
  function saveBands(b){ save(FATIGUE_BANDS_KEY, b); }
  let fatigueBands = loadBands();
  function renderBandsUI(){
    if (!fatigueBandsWrap) return;
    const rows = fatigueBands.map((band, idx) => `
      <div class="band-row" data-idx="${idx}">
        <span>開始</span><input type="time" value="${band.start}" data-k="start">
        <span>終了</span><input type="time" value="${band.end}" data-k="end">
        <span>疲労係数</span><input type="number" value="${band.weight}" min="0" step="0.5" data-k="weight">
        <button class="band-del">削除</button>
      </div>
    `).join('');
    fatigueBandsWrap.innerHTML = `<div class="bands">${rows || '<span class=\"hint\">時間帯がありません。「時間帯を追加」を押してください</span>'}</div>`;
  }
  function readBandsFromUI(){
    if (!fatigueBandsWrap) return fatigueBands;
    const rows = Array.from(fatigueBandsWrap.querySelectorAll('.band-row'));
    const out = [];
    for (const r of rows){
      const start = r.querySelector('input[data-k="start"]').value || '00:00';
      const end = r.querySelector('input[data-k="end"]').value || '00:00';
      const weight = parseFloat(r.querySelector('input[data-k="weight"]').value || '0') || 0;
      out.push({start, end, weight: Math.max(0, weight)});
    }
    return out;
  }
  function bindBandsUI(){
    if (!fatigueBandsWrap) return;
    fatigueBandsWrap.addEventListener('input', async () => {
      fatigueBands = readBandsFromUI();
      if (serverMode) {
        try { await apiPost('/api/fatigue-bands', { bands: fatigueBands }); } catch {}
      } else {
        saveBands(fatigueBands);
      }
      renderFatigue();
    });
    fatigueBandsWrap.addEventListener('click', (e) => {
      const del = e.target.closest('.band-del');
      if (del){
        const row = e.target.closest('.band-row');
        const idx = parseInt(row.dataset.idx, 10);
        fatigueBands.splice(idx,1); saveBands(fatigueBands); renderBandsUI(); bindBandsUI(); renderFatigue();
      }
    });
  }
  if (fatigueAddBandBtn) fatigueAddBandBtn.addEventListener('click', async () => {
    fatigueBands.push({start:'00:00', end:'00:00', weight:1});
    if (serverMode) { try { await apiPost('/api/fatigue-bands', { bands: fatigueBands }); } catch {} }
    else { saveBands(fatigueBands); }
    renderBandsUI(); bindBandsUI(); renderFatigue();
  });
  if (fatigueResetBandsBtn) fatigueResetBandsBtn.addEventListener('click', async () => {
    if (serverMode) {
      try { const fb = await apiPost('/api/fatigue-bands/reset', {}); fatigueBands = Array.isArray(fb.bands)?fb.bands:defaultBands(); } catch { fatigueBands = defaultBands(); }
    } else {
      fatigueBands = defaultBands(); saveBands(fatigueBands);
    }
    renderBandsUI(); bindBandsUI(); renderFatigue();
  });
  // operator and audit UI
  const operatorInput = $('#operator-name');
  const saveOperatorBtn = $('#save-operator');
  
  const auditTbody = $('#audit-table tbody');
  const refreshAuditBtn = $('#refresh-audit');
  const exportAuditLink = $('#export-audit');

  // Operator name (for audit actor)
  let operatorName = load('eop_actor', '') || '';
  if (operatorInput) operatorInput.value = operatorName;
  

  // Init defaults
  if (!dtInput.value) dtInput.value = nowLocalDatetime();
  if (!fromDate.value) fromDate.value = monthStartDate();
  if (!toDate.value) toDate.value = todayDate();
  // No period controls; compute with default lookback

  // Renderers
  function renderDoctors(){
    // Ensure unique and sorted by name
    doctors = uniq(doctors).sort((a,b)=>a.localeCompare(b,'ja'));
    // keep current selections
    const selected = new Set(Array.from(doctorList.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value));
    doctorList.innerHTML = doctors.map(d => `
      <label><input type="checkbox" value="${escapeHtml(d)}"> ${escapeHtml(d)}</label>
    `).join('');
    // restore selections
    doctorList.querySelectorAll('input[type="checkbox"]').forEach(ch => { ch.checked = selected.has(ch.value); });
    // settings 管理リスト
    if (doctorManageList) {
      doctorManageList.innerHTML = doctors.length
        ? doctors.map(d => `
            <span class="chip">${escapeHtml(d)} <button class="chip-del" data-del-doctor="${escapeHtml(d)}" title="削除">×</button></span>
          `).join('')
        : '<span class="hint">登録なし</span>';
    }
    save(storageKeys.doctors, doctors);
  }

  function renderLogs(){
    // 最近の記録は過去1週間のみ表示
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(end); start.setDate(end.getDate() - 6); start.setHours(0,0,0,0);
    const recent = getFilteredLogsRange(start, end);
    const rows = [...recent].sort((a,b)=> toLocalDate(b.datetime) - toLocalDate(a.datetime)).map(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorText = ds.join('、');
      return `
      <tr data-id="${l.id}">
        <td>${escapeHtml(formatDate(l.datetime))}</td>
        <td>${escapeHtml(doctorText)}</td>
        <td>${escapeHtml(l.note||'')}</td>
        <td style="text-align:right; display:flex; gap:6px; justify-content:flex-end">
          <button class="secondary" data-edit="${l.id}">編集</button>
          <button class="del-btn" data-del="${l.id}">削除</button>
        </td>
      </tr>`;
    }).join('');
    logsTableBody.innerHTML = rows || '<tr><td colspan="4" style="color:#9fb3c8">記録はまだありません</td></tr>';
    // Bind delete
    logsTableBody.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => deleteLog(btn.dataset.del)));
    // Bind edit
    logsTableBody.querySelectorAll('button[data-edit]').forEach(btn => btn.addEventListener('click', () => startEdit(btn.dataset.edit)));
  }

  let editingId = null;
  function toInputLocalString(stored){
    const d = toLocalDate(stored);
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startEdit(id){
    const item = logs.find(x => x.id === id);
    if (!item) return;
    editingId = id;
    // set inputs
    if (dtInput) dtInput.value = toInputLocalString(item.datetime);
    if (noteInput) noteInput.value = item.note || '';
    // doctors selection: always all doctors shown; check those in item
    const ds = Array.isArray(item.doctors) ? item.doctors : (item.doctor ? [item.doctor] : []);
    document.querySelectorAll('#doctor-list input[type="checkbox"]').forEach(ch => { ch.checked = ds.includes(ch.value); });
    // update UI
    if (submitBtn) submitBtn.textContent = '更新';
    if (clearFormBtn) clearFormBtn.textContent = '編集をキャンセル';
  }

  function cancelEdit(){
    editingId = null;
    if (submitBtn) submitBtn.textContent = '記録する';
    if (clearFormBtn) clearFormBtn.textContent = 'クリア';
    noteInput.value = '';
    dtInput.value = nowLocalDatetime();
    document.querySelectorAll('#doctor-list input[type="checkbox"]').forEach(ch => { ch.checked = false; });
  }

  function renderSearchLogs(){
    const { f, t } = getSearchRange();
    if (!f && !t) {
      if (searchLogsBody) {
        searchLogsBody.innerHTML = '<tr><td colspan="3" style="color:#9fb3c8">期間を指定してください</td></tr>';
      }
      return;
    }
    const list = getFilteredLogsRange(f, t).sort((a,b)=> toLocalDate(b.datetime) - toLocalDate(a.datetime));
    const rows = list.map(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorText = ds.join('、');
      return `<tr data-id="${l.id}"><td>${escapeHtml(formatDate(l.datetime))}</td><td>${escapeHtml(doctorText)}</td><td>${escapeHtml(l.note||'')}</td><td style=\"text-align:right\"><button class=\"del-btn\" data-del=\"${l.id}\">削除</button></td></tr>`;
    }).join('');
    if (searchLogsBody) {
      searchLogsBody.innerHTML = rows || '<tr><td colspan="4" style="color:#9fb3c8">該当データなし</td></tr>';
      // bind actions
      searchLogsBody.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => deleteLog(btn.dataset.del)));
    }
  }

  function getSearchRange(){
    const f = searchFrom && searchFrom.value ? new Date(searchFrom.value + 'T00:00:00') : null;
    const t = searchTo && searchTo.value ? new Date(searchTo.value + 'T23:59:59.999') : null;
    return { f, t };
  }

  function getFilteredLogs(){
    const f = fromDate.value ? new Date(fromDate.value + 'T00:00:00') : null;
    const t = toDate.value ? new Date(toDate.value + 'T23:59:59.999') : null;
    return logs.filter(l => {
      const d = toLocalDate(l.datetime);
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }

  function getFilteredLogsRange(f, t){
    return logs.filter(l => {
      const d = toLocalDate(l.datetime);
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }

  function renderSummary(){
    if (chart) syncCanvasSize(chart);
    // When no period specified, do not show table/chart
    if (!fromDate.value && !toDate.value) {
      summaryBody.innerHTML = '<tr><td colspan="2" style="color:#6b7280">期間を指定してください</td></tr>';
      statsLine.textContent = '';
      if (chart) {
        const ctx = chart.getContext('2d');
        ctx.clearRect(0,0,chart.width,chart.height);
      }
      return;
    }
    const filtered = getFilteredLogs();
    const counts = new Map();
    filtered.forEach(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      ds.forEach(d => counts.set(d, (counts.get(d)||0)+1));
    });
    let list = Array.from(counts.entries()).map(([doctor,count]) => ({doctor,count}));
    // sort
    list.sort((a,b)=>{
      if (sortSummary.key === 'count') {
        return sortSummary.dir === 'asc' ? a.count - b.count : b.count - a.count;
      } else {
        return sortSummary.dir === 'asc' ? a.doctor.localeCompare(b.doctor,'ja') : b.doctor.localeCompare(a.doctor,'ja');
      }
    });
    summaryBody.innerHTML = list.map(r => `<tr><td>${escapeHtml(r.doctor)}</td><td>${r.count}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#9fb3c8">データなし</td></tr>';
    statsLine.textContent = `期間内の総件数: ${filtered.length} 件 / 医師数: ${counts.size}`;
    drawChart(chart, list);
  }

  function drawChart(canvas, list){
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    // padding
    const pad = { t: 20, r: 16, b: 40, l: 100 };
    // Draw axes
    ctx.fillStyle = '#4b5563';
    ctx.font = '12px system-ui';
    // compute
    const max = Math.max(1, ...list.map(d => d.count));
    const barAreaW = w - pad.l - pad.r;
    const barAreaH = h - pad.t - pad.b;
    const barH = Math.min(28, (barAreaH / Math.max(1,list.length)) - 6);
    // grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    const gridSteps = Math.min(10, max);
    for(let i=0;i<=gridSteps;i++){
      const x = pad.l + (i / gridSteps) * barAreaW;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h-pad.b); ctx.stroke();
      ctx.fillStyle = '#4b5563';
      const label = Math.round((i/gridSteps)*max);
      ctx.fillText(String(label), x-6, h-pad.b+16);
    }
    // bars
    list.forEach((d, idx) => {
      const y = pad.t + idx * (barH + 6);
      const bw = (d.count / max) * barAreaW;
      // label
      ctx.fillStyle = '#4b5563';
      ctx.textAlign = 'right';
      ctx.fillText(d.doctor, pad.l - 10, y + barH - 6);
      // bar
      const grd = ctx.createLinearGradient(pad.l,0,pad.l+bw,0);
      if (canvas && canvas.id === 'fatigue-chart') {
        // Orange to Red for fatigue chart
        grd.addColorStop(0, '#f59e0b');
        grd.addColorStop(1, '#ef4444');
      } else {
        // Default blue to green
        grd.addColorStop(0, '#2eaadc');
        grd.addColorStop(1, '#65d48b');
      }
      ctx.fillStyle = grd;
      ctx.fillRect(pad.l, y, Math.max(2,bw), barH);
      // count
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'left';
      ctx.fillText(String(d.count), pad.l + bw + 6, y + barH - 6);
    });
  }

  function renderQuickRange(title, tbodyEl, canvasEl, statsEl, days){
    if (canvasEl) syncCanvasSize(canvasEl);
    // days: number of days back inclusive (e.g., 7 for 1w, 30 for 1m)
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(end); start.setDate(end.getDate() - (days - 1)); start.setHours(0,0,0,0);
    const filtered = getFilteredLogsRange(start, end);
    const counts = new Map();
    filtered.forEach(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      ds.forEach(d => counts.set(d, (counts.get(d)||0)+1));
    });
    const list = Array.from(counts.entries()).map(([doctor,count]) => ({doctor,count}))
      .sort((a,b)=> b.count - a.count);
    if (tbodyEl) {
      tbodyEl.innerHTML = list.map(r => `<tr><td>${escapeHtml(r.doctor)}</td><td>${r.count}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#9fb3c8">データなし</td></tr>';
    }
    if (statsEl) {
      statsEl.textContent = `${title}: 総件数 ${filtered.length} 件 / 医師数 ${counts.size}`;
    }
    drawChart(canvasEl, list);
  }

  // Actions
  clearSelectionBtn.addEventListener('click', () => {
    doctorList.querySelectorAll('input[type="checkbox"]').forEach(ch => ch.checked = false);
  });

  // 個別削除（設定タブ）
  if (doctorManageList) {
    doctorManageList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del-doctor]');
      if (!btn) return;
      const name = btn.getAttribute('data-del-doctor');
      if (!name) return;
      if (!confirm(`「${name}」を医師リストから削除します。既存の記録は残ります。よろしいですか？`)) return;
      if (serverMode) {
        apiDelete('/api/doctors/' + encodeURIComponent(name)).then(async () => {
          await syncFromServer(); renderDoctors();
        }).catch(()=> alert('サーバー削除に失敗しました'));
      } else {
        doctors = doctors.filter(d => d !== name);
        save(storageKeys.doctors, doctors);
        renderDoctors();
      }
    });
  }

  bulkAddBtn.addEventListener('click', () => {
    const text = (bulkDoctorsInput.value||'').trim();
    if (!text) return;
    const names = text.split(',').map(s=>s.trim()).filter(Boolean);
    if (serverMode) {
      apiPost('/api/doctors', {names}).then(async () => { bulkDoctorsInput.value=''; await syncFromServer(); renderDoctors(); }).catch(()=> alert('サーバー登録に失敗しました'));
    } else {
      doctors.push(...names);
      bulkDoctorsInput.value = '';
      renderDoctors();
    }
  });

  // 初期化ボタンは廃止

  clearFormBtn.addEventListener('click', () => {
    if (editingId) { cancelEdit(); return; }
    noteInput.value = '';
    dtInput.value = nowLocalDatetime();
  });
  if (saveOperatorBtn) {
    saveOperatorBtn.addEventListener('click', () => {
      operatorName = operatorInput.value.trim();
      save('eop_actor', operatorName);
      alert('操作者名を保存しました');
    });
  }
  

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedDoctors = Array.from(doctorList.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value);
    const datetime = dtInput.value ? new Date(dtInput.value) : new Date();
    // 秒は00固定
    datetime.setSeconds(0,0);
    if (selectedDoctors.length === 0) { alert('参加医師を1名以上選択してください'); return; }
    if (Number.isNaN(datetime.getTime())) { alert('日時が不正です'); return; }
    const note = (noteInput.value||'').trim();
    const localStr = formatLocalForStore(datetime);
    let id = editingId || `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    if (editingId) {
      // Optimistic update replace
      logs = logs.map(l => l.id === editingId ? { id, datetime: localStr, doctors: selectedDoctors, note } : l);
    } else {
      // Optimistic add
      logs.push({ id, datetime: localStr, doctors: selectedDoctors, note });
    }
    // ensure doctors exist
    let changed = false;
    selectedDoctors.forEach(d => { if (!doctors.includes(d)) { doctors.push(d); changed = true; } });
    if (changed) renderDoctors();
    if (!serverMode) save(storageKeys.logs, logs);
    renderLogs();
    renderSummary();
    renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
    renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
    renderFatigue();
    renderSearchLogs();
    if (serverMode) {
      const doServer = async () => {
        if (editingId) { try { await apiDelete('/api/logs/' + encodeURIComponent(id)); } catch {} }
        await apiPost('/api/logs', { id, datetime: localStr, doctors: selectedDoctors, note });
      };
      doServer().then(async () => {
        await syncFromServer();
        renderLogs(); renderSummary(); renderSearchLogs();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
        renderFatigue();
      }).catch(async ()=> { alert('サーバーへの保存に失敗しました'); await syncFromServer(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderFatigue(); });
    }
    cancelEdit();
  });

  function deleteLog(id){
    if (!confirm('この記録を削除しますか？')) return;
    // Optimistic local removal
    logs = logs.filter(l => l.id !== id);
    if (!serverMode) save(storageKeys.logs, logs);
    renderLogs(); renderSummary(); renderSearchLogs();
    renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
    renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
    renderFatigue();
    if (serverMode) {
      apiDelete('/api/logs/' + encodeURIComponent(id)).then(async () => {
        await syncFromServer();
        renderLogs(); renderSummary(); renderSearchLogs();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
        renderFatigue();
      }).catch(async ()=> { alert('サーバー削除に失敗しました'); await syncFromServer(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderFatigue(); });
    }
  }

  // Sorting summary
  summaryHeaders.forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortSummary.key === key) {
      sortSummary.dir = sortSummary.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortSummary.key = key;
      sortSummary.dir = key === 'doctor' ? 'asc' : 'desc';
    }
    renderSummary();
  }));

  // Filters
  applyFilterBtn.addEventListener('click', () => renderSummary());
  resetFilterBtn.addEventListener('click', () => { fromDate.value=''; toDate.value=''; renderSummary(); });

  if (searchBtn) searchBtn.addEventListener('click', () => renderSearchLogs());
  if (searchResetBtn) searchResetBtn.addEventListener('click', () => { if (searchFrom) searchFrom.value=''; if (searchTo) searchTo.value=''; renderSearchLogs(); });
  if (exportSearchCsvBtn) exportSearchCsvBtn.addEventListener('click', () => {
    const { f, t } = getSearchRange();
    const list = getFilteredLogsRange(f, t).sort((a,b)=> toLocalDate(b.datetime) - toLocalDate(a.datetime));
    const lines = [ ['datetime','doctor','note'].join(',') ];
    list.forEach(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorCell = ds.join(';');
      lines.push([l.datetime, doctorCell, l.note||''].map(csvEscape).join(','));
    });
    const name = makeSearchFilename('csv');
    downloadFile(name, new Blob([lines.join('\n')], {type:'text/csv'}));
  });

  function makeSearchFilename(ext){
    const fromStr = searchFrom && searchFrom.value ? searchFrom.value.replaceAll('-','') : 'all';
    const toStr = searchTo && searchTo.value ? searchTo.value.replaceAll('-','') : 'all';
    return `eop-search-${fromStr}-${toStr}.` + ext;
  }
  // Audit
  async function renderAudit(){
    if (!auditTbody) return;
    if (!serverMode) { auditTbody.innerHTML = '<tr><td colspan="4" style="color:#9fb3c8">サーバーモードでのみ利用できます</td></tr>'; return; }
    try{
      const data = await apiGet('/api/audit?limit=200');
      const rows = (data.audit||[]).map(a => `<tr><td>${escapeHtml(formatDate(a.ts))}</td><td>${escapeHtml(a.actor||'')}</td><td>${escapeHtml(a.action||'')}</td><td>${escapeHtml(a.details||'')}</td></tr>`).join('');
      auditTbody.innerHTML = rows || '<tr><td colspan="4" style="color:#9fb3c8">記録なし</td></tr>';
    }catch{ auditTbody.innerHTML = '<tr><td colspan="4" style="color:#9fb3c8">取得に失敗しました</td></tr>'; }
  }
  if (refreshAuditBtn) refreshAuditBtn.addEventListener('click', renderAudit);
  if (exportAuditLink) exportAuditLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (!serverMode) { alert('サーバーモードでのみ利用できます'); return; }
    window.open('/api/export/audit.csv', '_blank');
  });

  // Export / Import
  exportCsvBtn.addEventListener('click', () => {
    const lines = [ ['datetime','doctor','note'].join(',') ];
    logs.forEach(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorCell = ds.join(';');
      lines.push([l.datetime, doctorCell, l.note||''].map(csvEscape).join(','));
    });
    downloadFile('eop-logs.csv', new Blob([lines.join('\n')], {type:'text/csv'}));
  });


  importCsvInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const text = await file.text();
      const rows = text.split(/\r?\n/).filter(Boolean).map(r => parseCsvRow(r));
      if (!rows.length) throw new Error('empty');
      // header
      const header = rows.shift().map(h => h.toLowerCase());
      const idxDatetime = header.indexOf('datetime');
      const idxDoctor = header.indexOf('doctor');
      const idxNote = header.indexOf('note');
      if (idxDatetime < 0 || idxDoctor < 0) throw new Error('header');
      if (!confirm('読み込んだCSVで記録を置き換えます。よろしいですか？')) return;
      const newLogs = rows.map(cols => {
        const raw = cols[idxDoctor] || '';
        const parts = raw.split(/[;]+/).map(s=>s.trim()).filter(Boolean);
        const doctorsArr = parts.length ? parts : raw.split(',').map(s=>s.trim()).filter(Boolean);
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          datetime: cols[idxDatetime],
          doctors: doctorsArr,
          note: idxNote >= 0 ? (cols[idxNote]||'') : ''
        };
      }).filter(v => v.datetime && v.doctors && v.doctors.length);
      if (serverMode) {
        if (!confirm('サーバー上の全記録を置き換えます。よろしいですか？')) return;
        await apiPost('/api/logs/clear', {});
        // Ensure doctors set
        const importedDoctors = uniq(newLogs.flatMap(l => l.doctors));
        await apiPost('/api/doctors', { names: importedDoctors });
        // Bulk insert logs sequentially (simple, small scale)
        for (const l of newLogs) {
          await apiPost('/api/logs', { datetime: l.datetime, doctors: l.doctors, note: l.note });
        }
        await syncFromServer();
        renderDoctors(); renderLogs(); renderSummary();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
        renderFatigue();
      } else {
        logs = newLogs;
        // update doctors as union
        const importedDoctors = uniq(newLogs.flatMap(l => l.doctors));
        doctors = uniq([...doctors, ...importedDoctors]);
        save(storageKeys.doctors, doctors);
        save(storageKeys.logs, logs);
        renderDoctors(); renderLogs(); renderSummary();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
        renderFatigue();
      }
    } catch(err) {
      alert('CSVの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    if (!confirm('全記録を削除します。よろしいですか？')) return;
    if (serverMode) {
      apiPost('/api/logs/clear', {}).then(async () => { await syncFromServer(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs(); renderFatigue(); }).catch(()=> alert('サーバー処理に失敗しました'));
    } else {
      logs = [];
      save(storageKeys.logs, logs);
      renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs(); renderFatigue();
    }
  });

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  }

  function csvEscape(v){
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function parseCsvRow(row){
    // simple CSV parser for commas and quotes
    const out = [];
    let cur = '';
    let q = false;
    for (let i=0;i<row.length;i++){
      const ch = row[i];
      if (q){
        if (ch === '"' && row[i+1] === '"'){ cur += '"'; i++; }
        else if (ch === '"'){ q = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { q = true; }
        else if (ch === ',') { out.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out;
  }

  function downloadFile(name, blob){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // Initial render with auto server detection
  (async () => {
    try { await detectServer(); } catch {}
    if (serverMode) { await syncFromServer(); }
    if (doctors.length === 0) doctors = [];
    renderBandsUI();
    bindBandsUI();
    renderDoctors();
    renderLogs();
    renderSummary();
    renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
    renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
    renderSearchLogs();
    renderFatigue();
    renderAudit();
    // simple polling to reflect others' changes
    if (serverMode) setInterval(async ()=>{ await syncFromServer(); renderBandsUI(); renderDoctors(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs(); renderFatigue(); renderAudit(); }, 30000);
  })();

  // Fatigue logic
  function renderFatigue(){
    if (!fatigueChart) return;
    syncCanvasSize(fatigueChart);
    // 常に今日を対象（現在時点の疲労度）。n=7で固定。
    const N = 7;
    const start = new Date(); start.setDate(start.getDate() - N); start.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    // Doctors to include: all doctors
    const names = doctors.slice();
    // 現在時点での値を算出（一般化バンド）
    const now = new Date();
    fatigueBands = readBandsFromUI();
    if (!fatigueBands || fatigueBands.length === 0) fatigueBands = defaultBands();
    const currentValues = computeFatigueCurrentGeneral(names, N, fatigueBands, now);
    const list = names.map((doctor, i) => ({ doctor, count: currentValues[i] || 0 })).sort((a,b)=> b.count - a.count);
    drawChart(fatigueChart, list);
  }

  function syncCanvasSize(c){
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth || c.width || 640;
    const cssH = c.clientHeight || c.height || 300;
    c.width = Math.max(300, Math.floor(cssW * dpr));
    c.height = Math.max(180, Math.floor(cssH * dpr));
  }

  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      renderSummary();
      renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
      renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
      renderFatigue();
    }, 150);
  });

  function computeFatigueCurrent(targetDoctors, N, a, b, now){
    const todayLocal = new Date(now); todayLocal.setHours(0,0,0,0);
    const minLocal = new Date(todayLocal); minLocal.setDate(minLocal.getDate() - N);
    const parsed = logs.map(l => ({ t: toLocalDate(l.datetime), doctors: Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []) }));
    const relevant = parsed.filter(x => x.t >= minLocal && x.t <= now);
    const values = targetDoctors.map(()=>0);
    for (let i=0;i<targetDoctors.length;i++){
      const name = targetDoctors[i];
      let sum = 0;
      for (let n=1;n<=N;n++){
        const decay = Math.pow(0.5, n);
        const baseLocal = new Date(todayLocal); baseLocal.setDate(todayLocal.getDate()-n);
        const nextLocal = new Date(todayLocal); nextLocal.setDate(todayLocal.getDate()-(n-1));
        const eveStart = new Date(baseLocal.getFullYear(), baseLocal.getMonth(), baseLocal.getDate(), 17, 0, 0, 0);
        const eveEnd = new Date(baseLocal.getFullYear(), baseLocal.getMonth(), baseLocal.getDate(), 21, 0, 0, 0);
        const nightStart = new Date(baseLocal.getFullYear(), baseLocal.getMonth(), baseLocal.getDate(), 21, 0, 0, 0);
        const nightEnd = new Date(nextLocal.getFullYear(), nextLocal.getMonth(), nextLocal.getDate(), 9, 0, 0, 0);
        relevant.forEach(x => {
          if (!x.doctors.includes(name)) return;
          const t = x.t;
          if (t >= eveStart && t < eveEnd) sum += 2*a*decay;
          else if (t >= nightStart && t < nightEnd) sum += 2*b*decay;
        });
      }
      values[i] = sum;
    }
    return values;
  }

  function computeFatigueCurrentGeneral(targetDoctors, N, bands, now){
    const todayLocal = new Date(now); todayLocal.setHours(0,0,0,0);
    const minLocal = new Date(todayLocal); minLocal.setDate(minLocal.getDate() - N);
    const parsed = logs.map(l => ({ t: toLocalDate(l.datetime), doctors: Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []) }));
    const relevant = parsed.filter(x => x.t >= minLocal && x.t <= now);
    const values = targetDoctors.map(()=>0);
    const parseHM = (s) => { const [hh,mm] = (s||'0:0').split(':').map(x=>parseInt(x,10)||0); return {hh,mm}; };
    for (let i=0;i<targetDoctors.length;i++){
      const name = targetDoctors[i];
      let sum = 0;
      for (let n=1;n<=N;n++){
        const decay = Math.pow(0.5, n);
        const baseLocal = new Date(todayLocal); baseLocal.setDate(todayLocal.getDate()-n);
        const nextLocal = new Date(todayLocal); nextLocal.setDate(todayLocal.getDate()-(n-1));
        for (const band of bands){
          const {hh:sh, mm:sm} = parseHM(band.start);
          const {hh:eh, mm:em} = parseHM(band.end);
          const weight = Math.max(0, Number(band.weight)||0);
          const startEnc = new Date(baseLocal.getFullYear(), baseLocal.getMonth(), baseLocal.getDate(), sh, sm, 0, 0);
          const crosses = (eh*60+em) <= (sh*60+sm);
          const endDay = crosses ? nextLocal : baseLocal;
          const endEnc = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), eh, em, 0, 0);
          relevant.forEach(x => {
            if (!x.doctors.includes(name)) return;
            const t = x.t;
            if (t >= startEnc && t < endEnc) sum += 2*weight*decay;
          });
        }
      }
      values[i] = sum;
    }
    return values;
  }

  function computeFatigueSeries(targetDoctors, from, to){
    // Determine day range
    const endDay = new Date(to || new Date()); endDay.setHours(0,0,0,0);
    const startDay = new Date(from || new Date(endDay)); startDay.setHours(0,0,0,0);
    // Expand to include previous day for first window
    const windowStart = new Date(startDay); windowStart.setDate(startDay.getDate()-1); windowStart.setHours(17,0,0,0);
    const windowEnd = new Date(endDay); windowEnd.setHours(9,1,0,0);
    // Filter logs in needed span
    const spanLogs = logs.filter(l => {
      const d = new Date(l.datetime);
      return d >= windowStart && d <= windowEnd;
    });
    // Index by doctor
    const perDoc = new Map();
    targetDoctors.forEach(d => perDoc.set(d, []));
    spanLogs.forEach(l => {
      const d = new Date(l.datetime);
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      ds.forEach(name => { if (perDoc.has(name)) perDoc.get(name).push(d); });
    });
    // Sort timestamps
    perDoc.forEach(list => list.sort((a,b)=> a-b));
    // Iterate days
    const dates = [];
    const acc = targetDoctors.map(()=>0);
    const values = targetDoctors.map(()=>[]);
    for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate()+1)){
      const dCopy = new Date(day);
      // 09:00 halve then 09:01 add
      for (let i=0;i<acc.length;i++){ acc[i] = acc[i] * 0.5; }
      // windows
      const prevStart = new Date(day); prevStart.setDate(day.getDate()-1); prevStart.setHours(17,0,0,0);
      const prevNight = new Date(day); prevNight.setDate(day.getDate()-1); prevNight.setHours(22,0,0,0);
      const morningEnd = new Date(day); morningEnd.setHours(9,1,0,0); // include up to 09:00
      for (let i=0;i<targetDoctors.length;i++){
        const name = targetDoctors[i];
        const times = perDoc.get(name) || [];
        // +1 for [17:00, 22:00)
        let add = 0;
        for (const t0 of times){ if (t0 >= prevStart && t0 < prevNight) add += 1; else if (t0 >= prevNight && t0 < morningEnd) add += 2; }
        acc[i] += add;
        values[i].push(acc[i]);
      }
      // record at 09:01
      dates.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 1, 0, 0));
    }
    return { dates, doctors: targetDoctors, values };
  }

  // drawFatigueChart removed; use drawChart() to render horizontal bars

  // Fatigue controls
  // No per-doctor selection; always show all
  // bands UI change is handled in bindBandsUI via input events
})();
