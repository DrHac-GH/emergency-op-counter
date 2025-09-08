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
  async function apiGet(path){ const r = await fetch(path, {credentials:'same-origin'}); if(!r.ok) throw new Error('GET '+path); return r.json(); }
  async function apiPost(path, body){ const payload = Object.assign({}, body||{}, operatorName ? {actor: operatorName} : {}); const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), credentials:'same-origin'}); if(!r.ok) throw new Error('POST '+path); return r.json(); }
  async function apiDelete(path){ const url = actorParam() ? (path + (path.includes('?')?'&':'?') + actorParam()) : path; const r = await fetch(url, {method:'DELETE', credentials:'same-origin'}); if(!r.ok) throw new Error('DELETE '+path); return r.json(); }
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
    } catch(e){ console.warn('Sync failed', e); }
  }
  const formatDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}時`;
  };
  const nowLocalDatetime = () => {
    const d = new Date();
    d.setMinutes(0,0,0);
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
  const clearDoctorsBtn = $('#clear-doctors');
  const form = $('#log-form');
  const dtInput = $('#datetime');
  const noteInput = $('#note');
  const clearFormBtn = $('#clear-form');
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
    const rows = [...recent].sort((a,b)=> b.datetime.localeCompare(a.datetime)).map(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorText = ds.join('、');
      return `
      <tr data-id="${l.id}">
        <td>${escapeHtml(formatDate(l.datetime))}</td>
        <td>${escapeHtml(doctorText)}</td>
        <td>${escapeHtml(l.note||'')}</td>
        <td style="text-align:right"><button class="del-btn" data-del="${l.id}">削除</button></td>
      </tr>`;
    }).join('');
    logsTableBody.innerHTML = rows || '<tr><td colspan="4" style="color:#9fb3c8">記録はまだありません</td></tr>';
    // Bind delete
    logsTableBody.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => deleteLog(btn.dataset.del)));
  }

  function renderSearchLogs(){
    const { f, t } = getSearchRange();
    const list = getFilteredLogsRange(f, t).sort((a,b)=> b.datetime.localeCompare(a.datetime));
    const rows = list.map(l => {
      const ds = Array.isArray(l.doctors) ? l.doctors : (l.doctor ? [l.doctor] : []);
      const doctorText = ds.join('、');
      return `<tr><td>${escapeHtml(formatDate(l.datetime))}</td><td>${escapeHtml(doctorText)}</td><td>${escapeHtml(l.note||'')}</td></tr>`;
    }).join('');
    if (searchLogsBody) {
      searchLogsBody.innerHTML = rows || '<tr><td colspan="3" style="color:#9fb3c8">該当データなし</td></tr>';
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
      const d = new Date(l.datetime);
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }

  function getFilteredLogsRange(f, t){
    return logs.filter(l => {
      const d = new Date(l.datetime);
      if (f && d < f) return false;
      if (t && d > t) return false;
      return true;
    });
  }

  function renderSummary(){
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
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '12px system-ui';
    // compute
    const max = Math.max(1, ...list.map(d => d.count));
    const barAreaW = w - pad.l - pad.r;
    const barAreaH = h - pad.t - pad.b;
    const barH = Math.min(28, (barAreaH / Math.max(1,list.length)) - 6);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const gridSteps = Math.min(10, max);
    for(let i=0;i<=gridSteps;i++){
      const x = pad.l + (i / gridSteps) * barAreaW;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h-pad.b); ctx.stroke();
      ctx.fillStyle = '#9fb3c8';
      const label = Math.round((i/gridSteps)*max);
      ctx.fillText(String(label), x-6, h-pad.b+16);
    }
    // bars
    list.forEach((d, idx) => {
      const y = pad.t + idx * (barH + 6);
      const bw = (d.count / max) * barAreaW;
      // label
      ctx.fillStyle = '#9fb3c8';
      ctx.textAlign = 'right';
      ctx.fillText(d.doctor, pad.l - 10, y + barH - 6);
      // bar
      const grd = ctx.createLinearGradient(pad.l,0,pad.l+bw,0);
      grd.addColorStop(0, '#2eaadc');
      grd.addColorStop(1, '#65d48b');
      ctx.fillStyle = grd;
      ctx.fillRect(pad.l, y, Math.max(2,bw), barH);
      // count
      ctx.fillStyle = '#e7eef8';
      ctx.textAlign = 'left';
      ctx.fillText(String(d.count), pad.l + bw + 6, y + barH - 6);
    });
  }

  function renderQuickRange(title, tbodyEl, canvasEl, statsEl, days){
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

  clearDoctorsBtn.addEventListener('click', () => {
    if (!confirm('医師リストを初期化します。よろしいですか？')) return;
    if (serverMode) {
      apiPost('/api/doctors/reset', {}).then(async () => { await syncFromServer(); renderDoctors(); }).catch(()=> alert('サーバー処理に失敗しました'));
    } else {
      doctors = [];
      renderDoctors();
    }
  });

  clearFormBtn.addEventListener('click', () => {
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
    // 分は扱わない（時単位）。入力が分付きでも切り捨てる。
    datetime.setMinutes(0,0,0);
    if (selectedDoctors.length === 0) { alert('参加医師を1名以上選択してください'); return; }
    if (Number.isNaN(datetime.getTime())) { alert('日時が不正です'); return; }
    const note = (noteInput.value||'').trim();
    const iso = new Date(datetime.getTime() - datetime.getTimezoneOffset()*60000).toISOString();
    if (serverMode) {
      apiPost('/api/logs', { datetime: iso, doctors: selectedDoctors, note }).then(async () => {
        await syncFromServer();
        renderDoctors(); renderLogs(); renderSummary();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
      }).catch(()=> alert('サーバーへの保存に失敗しました'));
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      logs.push({ id, datetime: iso, doctors: selectedDoctors, note });
      // ensure doctors exist
      let changed = false;
      selectedDoctors.forEach(d => { if (!doctors.includes(d)) { doctors.push(d); changed = true; } });
      if (changed) renderDoctors();
      save(storageKeys.logs, logs);
      renderLogs();
      renderSummary();
      renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
      renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
    }
    noteInput.value = '';
    dtInput.value = nowLocalDatetime();
    doctorList.querySelectorAll('input[type="checkbox"]').forEach(ch => ch.checked = false);
  });

  function deleteLog(id){
    if (!confirm('この記録を削除しますか？')) return;
    if (serverMode) {
      apiDelete('/api/logs/' + encodeURIComponent(id)).then(async () => {
        await syncFromServer();
        renderLogs(); renderSummary();
        renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
        renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
      }).catch(()=> alert('サーバー削除に失敗しました'));
    } else {
      logs = logs.filter(l => l.id !== id);
      save(storageKeys.logs, logs);
      renderLogs();
      renderSummary();
      renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
      renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
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
    const list = getFilteredLogsRange(f, t).sort((a,b)=> b.datetime.localeCompare(a.datetime));
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
      apiPost('/api/logs/clear', {}).then(async () => { await syncFromServer(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs(); }).catch(()=> alert('サーバー処理に失敗しました'));
    } else {
      logs = [];
      save(storageKeys.logs, logs);
      renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs();
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
    renderDoctors();
    renderLogs();
    renderSummary();
    renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7);
    renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30);
    renderSearchLogs();
    renderAudit();
    // simple polling to reflect others' changes
    if (serverMode) setInterval(async ()=>{ await syncFromServer(); renderDoctors(); renderLogs(); renderSummary(); renderQuickRange('過去1週間', summaryBody1w, chart1w, statsLine1w, 7); renderQuickRange('過去1ヶ月', summaryBody1m, chart1m, statsLine1m, 30); renderSearchLogs(); renderAudit(); }, 30000);
  })();
})();
