// Minimal Node.js server with file-backed storage (no dependencies)
// Serves static files and exposes REST APIs for shared doctors/logs

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const rootDir = __dirname; // serves this folder
const dataFile = path.join(__dirname, 'data.json');

// Initialize data file if not exists
function loadData(){
  try {
    const txt = fs.readFileSync(dataFile, 'utf8');
    const obj = JSON.parse(txt);
    if (!obj.doctors || !Array.isArray(obj.doctors)) obj.doctors = [];
    if (!obj.logs || !Array.isArray(obj.logs)) obj.logs = [];
    if (!obj.audit || !Array.isArray(obj.audit)) obj.audit = [];
    return obj;
  } catch (e) {
    return { doctors: [], logs: [], audit: [] };
  }
}

function saveData(data){
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// utilities
function send(res, status, body, headers={}){
  const h = Object.assign({'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}, headers);
  res.writeHead(status, h);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function notFound(res){ send(res, 404, {error:'not_found'}); }
function badRequest(res, msg='bad_request'){ send(res, 400, {error:msg}); }

function parseBody(req){
  return new Promise((resolve) => {
    let data='';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}

function serveStatic(req, res){
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' ) urlPath = '/index.html';
  const filePath = path.join(rootDir, urlPath);
  if (!filePath.startsWith(rootDir)) return notFound(res);
  fs.readFile(filePath, (err, buf) => {
    if (err) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    const map = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8'};
    res.writeHead(200, {'Content-Type': map[ext] || 'application/octet-stream'});
    res.end(buf);
  });
}

function getClientIp(req){
  // naive IP extraction
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress || 'unknown';
}

function getActor(req, body){
  return (body && body.actor) || req.headers['x-actor'] || new URL(req.url, `http://${req.headers.host}`).searchParams.get('actor') || getClientIp(req);
}

function auditAppend(data, entry){
  data.audit.push(entry);
  if (data.audit.length > 5000) {
    data.audit = data.audit.slice(-5000); // keep last 5000
  }
}

function csvEscape(v){
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    // API routing
    const data = loadData();
    if (pathname === '/api/ping' && req.method === 'GET') return send(res, 200, {ok:true});

    if (pathname === '/api/doctors' && req.method === 'GET') return send(res, 200, {doctors: data.doctors});
    if (pathname === '/api/doctors' && req.method === 'POST'){
      const body = await parseBody(req) || {};
      const names = Array.isArray(body.names) ? body.names : [];
      const set = new Set(data.doctors);
      names.forEach(n => { if (n && typeof n === 'string') set.add(n); });
      data.doctors = Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'));
      auditAppend(data, { id: Date.now()+":dadd", ts: new Date().toISOString(), actor: getActor(req, body), action: 'doctors_add', details: `names=${names.join(';')}` });
      saveData(data);
      return send(res, 200, {doctors: data.doctors});
    }
    if (pathname === '/api/doctors/reset' && req.method === 'POST'){
      const body = await parseBody(req) || {};
      data.doctors = [];
      auditAppend(data, { id: Date.now()+":dreset", ts: new Date().toISOString(), actor: getActor(req, body), action: 'doctors_reset', details: '' });
      saveData(data);
      return send(res, 200, {doctors: data.doctors});
    }
    if (pathname.startsWith('/api/doctors/') && req.method === 'DELETE'){
      const name = decodeURIComponent(pathname.replace('/api/doctors/',''));
      data.doctors = data.doctors.filter(d => d !== name);
      auditAppend(data, { id: Date.now()+":ddel", ts: new Date().toISOString(), actor: getActor(req), action: 'doctor_delete', details: name });
      saveData(data);
      return send(res, 200, {doctors: data.doctors});
    }

    if (pathname === '/api/logs' && req.method === 'GET'){
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      const list = data.logs.filter(l => {
        const d = new Date(l.datetime);
        if (f && d < f) return false;
        if (t && d > t) return false;
        return true;
      }).sort((a,b)=> b.datetime.localeCompare(a.datetime));
      return send(res, 200, {logs: list});
    }
    if (pathname === '/api/logs' && req.method === 'POST'){
      const body = await parseBody(req) || {};
      const doctors = Array.isArray(body.doctors) ? body.doctors.filter(Boolean) : [];
      const datetime = body.datetime;
      if (!datetime || !doctors.length) return badRequest(res, 'invalid_payload');
      const note = typeof body.note === 'string' ? body.note : '';
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const log = { id, datetime, doctors, note };
      data.logs.push(log);
      // ensure doctors set includes all
      const set = new Set(data.doctors);
      doctors.forEach(d => set.add(d));
      data.doctors = Array.from(set).sort((a,b)=>a.localeCompare(b,'ja'));
      auditAppend(data, { id: Date.now()+":ladd", ts: new Date().toISOString(), actor: getActor(req, body), action: 'log_add', details: `id=${id},dt=${datetime},doctors=${doctors.join(';')}` });
      saveData(data);
      return send(res, 200, {log});
    }
    if (pathname.startsWith('/api/logs/') && req.method === 'DELETE'){
      const id = pathname.replace('/api/logs/','');
      const before = data.logs.length;
      data.logs = data.logs.filter(l => l.id !== id);
      auditAppend(data, { id: Date.now()+":ldel", ts: new Date().toISOString(), actor: getActor(req), action: 'log_delete', details: `id=${id}` });
      saveData(data);
      return send(res, 200, {deleted: before - data.logs.length});
    }
    if (pathname === '/api/logs/clear' && req.method === 'POST'){
      const body = await parseBody(req) || {};
      data.logs = [];
      auditAppend(data, { id: Date.now()+":lclear", ts: new Date().toISOString(), actor: getActor(req, body), action: 'logs_clear', details: '' });
      saveData(data);
      return send(res, 200, {ok:true});
    }
    if (pathname === '/api/export/logs.csv' && req.method === 'GET'){
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      const list = data.logs.filter(l => {
        const d = new Date(l.datetime);
        if (f && d < f) return false;
        if (t && d > t) return false;
        return true;
      }).sort((a,b)=> b.datetime.localeCompare(a.datetime));
      const lines = [ ['datetime','doctor','note'].join(',') ];
      list.forEach(l => lines.push([l.datetime, (l.doctors||[]).join(';'), l.note||''].map(csvEscape).join(',')));
      res.writeHead(200, {'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eop-logs.csv"','Access-Control-Allow-Origin':'*'});
      return res.end(lines.join('\n'));
    }

    // Audit endpoints
    if (pathname === '/api/audit' && req.method === 'GET'){
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const limit = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit')||'200',10)));
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      const list = data.audit.filter(a => {
        const d = new Date(a.ts);
        if (f && d < f) return false;
        if (t && d > t) return false;
        return true;
      }).slice(-limit).reverse();
      return send(res, 200, {audit: list});
    }
    if (pathname === '/api/export/audit.csv' && req.method === 'GET'){
      const lines = [ ['ts','actor','action','details'].join(',') ];
      data.audit.forEach(a => lines.push([a.ts, a.actor||'', a.action||'', a.details||''].map(csvEscape).join(',')));
      res.writeHead(200, {'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eop-audit.csv"','Access-Control-Allow-Origin':'*'});
      return res.end(lines.join('\n'));
    }

    return notFound(res);
  }

  // Static
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
