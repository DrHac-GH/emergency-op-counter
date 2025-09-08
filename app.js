(() => {
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
  const formatDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
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
  const doctorSel = $('#doctor');
  const newDoctorInput = $('#new-doctor');
  const addDoctorBtn = $('#add-doctor');
  const bulkDoctorsInput = $('#bulk-doctors');
  const bulkAddBtn = $('#bulk-add');
  const clearDoctorsBtn = $('#clear-doctors');
  const form = $('#log-form');
  const dtInput = $('#datetime');
  const noteInput = $('#note');
  const clearFormBtn = $('#clear-form');
  const logsTableBody = $('#logs-table tbody');
  const summaryBody = $('#summary-table tbody');
  const summaryHeaders = $$('#summary-table th[data-sort]');
  const fromDate = $('#from-date');
  const toDate = $('#to-date');
  const applyFilterBtn = $('#apply-filter');
  const resetFilterBtn = $('#reset-filter');
  const statsLine = $('#stats-line');
  const chart = $('#chart');
  const exportJsonBtn = $('#export-json');
  const exportCsvBtn = $('#export-csv');
  const importJsonInput = $('#import-json');
  const importCsvInput = $('#import-csv');
  const clearLogsBtn = $('#clear-logs');

  // Init defaults
  if (!dtInput.value) dtInput.value = nowLocalDatetime();
  if (!fromDate.value) fromDate.value = monthStartDate();
  if (!toDate.value) toDate.value = todayDate();

  // Renderers
  function renderDoctors(){
    // Ensure unique and sorted by name
    doctors = uniq(doctors).sort((a,b)=>a.localeCompare(b,'ja'));
    doctorSel.innerHTML = doctors.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    save(storageKeys.doctors, doctors);
  }

  function renderLogs(){
    const rows = [...logs].sort((a,b)=> b.datetime.localeCompare(a.datetime)).map(l => `
      <tr data-id="${l.id}">
        <td>${escapeHtml(formatDate(l.datetime))}</td>
        <td>${escapeHtml(l.doctor)}</td>
        <td>${escapeHtml(l.note||'')}</td>
        <td style="text-align:right"><button class="del-btn" data-del="${l.id}">削除</button></td>
      </tr>
    `).join('');
    logsTableBody.innerHTML = rows || '<tr><td colspan="4" style="color:#9fb3c8">記録はまだありません</td></tr>';
    // Bind delete
    logsTableBody.querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => deleteLog(btn.dataset.del)));
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

  function renderSummary(){
    const filtered = getFilteredLogs();
    const counts = new Map();
    filtered.forEach(l => counts.set(l.doctor, (counts.get(l.doctor)||0)+1));
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
    drawChart(list);
  }

  function drawChart(list){
    const ctx = chart.getContext('2d');
    const w = chart.width, h = chart.height;
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

  // Actions
  addDoctorBtn.addEventListener('click', () => {
    const name = (newDoctorInput.value||'').trim();
    if (!name) return;
    doctors.push(name);
    newDoctorInput.value = '';
    renderDoctors();
  });

  bulkAddBtn.addEventListener('click', () => {
    const text = (bulkDoctorsInput.value||'').trim();
    if (!text) return;
    const names = text.split(',').map(s=>s.trim()).filter(Boolean);
    doctors.push(...names);
    bulkDoctorsInput.value = '';
    renderDoctors();
  });

  clearDoctorsBtn.addEventListener('click', () => {
    if (!confirm('医師リストを初期化します。よろしいですか？')) return;
    doctors = [];
    renderDoctors();
  });

  clearFormBtn.addEventListener('click', () => {
    noteInput.value = '';
    dtInput.value = nowLocalDatetime();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const doctor = doctorSel.value || (newDoctorInput.value||'').trim();
    const datetime = dtInput.value ? new Date(dtInput.value) : new Date();
    if (!doctor) { alert('医師を選択または追加してください'); return; }
    if (Number.isNaN(datetime.getTime())) { alert('日時が不正です'); return; }
    const note = (noteInput.value||'').trim();
    const iso = new Date(datetime.getTime() - datetime.getTimezoneOffset()*60000).toISOString();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    logs.push({ id, datetime: iso, doctor, note });
    // ensure doctor exists
    if (!doctors.includes(doctor)) { doctors.push(doctor); renderDoctors(); }
    save(storageKeys.logs, logs);
    renderLogs();
    renderSummary();
    noteInput.value = '';
    dtInput.value = nowLocalDatetime();
  });

  function deleteLog(id){
    if (!confirm('この記録を削除しますか？')) return;
    logs = logs.filter(l => l.id !== id);
    save(storageKeys.logs, logs);
    renderLogs();
    renderSummary();
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

  // Export / Import
  exportJsonBtn.addEventListener('click', () => {
    const data = { doctors, logs };
    downloadFile('eop-data.json', new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  });
  exportCsvBtn.addEventListener('click', () => {
    const lines = [ ['datetime','doctor','note'].join(',') ];
    logs.forEach(l => lines.push([l.datetime, l.doctor, l.note||''].map(csvEscape).join(',')));
    downloadFile('eop-logs.csv', new Blob([lines.join('\n')], {type:'text/csv'}));
  });

  importJsonInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.doctors) || !Array.isArray(data.logs)) throw new Error('invalid');
      if (!confirm('読み込んだJSONでデータを置き換えます。よろしいですか？')) return;
      doctors = uniq(data.doctors);
      logs = data.logs.filter(v => v && v.datetime && v.doctor).map(v => ({ id: v.id || `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, datetime: v.datetime, doctor: v.doctor, note: v.note||'' }));
      save(storageKeys.doctors, doctors);
      save(storageKeys.logs, logs);
      renderDoctors(); renderLogs(); renderSummary();
    } catch(err) {
      alert('JSONの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
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
      const newLogs = rows.map(cols => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        datetime: cols[idxDatetime],
        doctor: cols[idxDoctor],
        note: idxNote >= 0 ? (cols[idxNote]||'') : ''
      })).filter(v => v.datetime && v.doctor);
      logs = newLogs;
      // update doctors as union
      const importedDoctors = uniq(newLogs.map(l => l.doctor));
      doctors = uniq([...doctors, ...importedDoctors]);
      save(storageKeys.doctors, doctors);
      save(storageKeys.logs, logs);
      renderDoctors(); renderLogs(); renderSummary();
    } catch(err) {
      alert('CSVの読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    if (!confirm('全記録を削除します。よろしいですか？')) return;
    logs = [];
    save(storageKeys.logs, logs);
    renderLogs(); renderSummary();
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

  // Initial render
  if (doctors.length === 0) {
    doctors = [];
  }
  renderDoctors();
  renderLogs();
  renderSummary();
})();

