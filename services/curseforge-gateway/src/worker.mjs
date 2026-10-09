import {configuredBudget,reserve,release} from './budget.mjs';
export {GatewayBudget} from './budget.mjs';
const API = 'https://api.curseforge.com/v1/';
const CLASSES = new Set(['6', '4471', '12', '6552', '6945']);
const encoder = new TextEncoder();
const MAX_DOWNLOAD = 16*1024*1024*1024;
const signingKeys = new WeakMap();
class Failure extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new Failure(status, code, message); };
const json = (value, status = 200, extra = {}) => Response.json(value, {status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra}});
const numeric = value => /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 0xffffffff;
const cdn = url => url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && ['edge.forgecdn.net', 'mediafilez.forgecdn.net', 'media.forgecdn.net'].includes(url.hostname);

function route(url) {
  if (url.pathname === '/health') { validateQuery(url, new Set(['check'])); if (url.searchParams.has('check') && url.searchParams.get('check') !== 'api') fail(400, 'invalid_request', 'Unknown health check'); return {health: true}; }
  if (url.pathname === '/v1/minecraft/version') { validateQuery(url, new Set(['sortDescending'])); if (url.searchParams.has('sortDescending') && !['true','false'].includes(url.searchParams.get('sortDescending'))) fail(400, 'invalid_request', 'Invalid sort'); return {path:'minecraft/version'}; }
  if (url.pathname === '/v1/categories') {
    validateQuery(url, new Set(['gameId','classId']));
    if (url.searchParams.get('gameId') !== '432' || !CLASSES.has(url.searchParams.get('classId'))) fail(400, 'invalid_request', 'Choose a Minecraft content class');
    return {path:'categories'};
  }
  let match = /^\/v1\/download\/([0-9]+)\/([0-9]+)$/.exec(url.pathname);
  if (match && match.slice(1).every(numeric)) {
    if ([...url.searchParams.keys()].some(k => k !== 'ticket') || url.searchParams.getAll('ticket').length > 1 || (url.searchParams.get('ticket') || '').length > 100) fail(400, 'invalid_request', 'Unsupported download parameter');
    return {download: true, project: match[1], file: match[2]};
  }
  if (url.pathname === '/v1/mods/search') {
    const allowed = new Set(['gameId', 'classId', 'searchFilter', 'sortField', 'sortOrder', 'index', 'pageSize', 'gameVersion', 'modLoaderType', 'categoryId']);
    validateQuery(url, allowed);
    if (url.searchParams.has('gameId') && url.searchParams.get('gameId') !== '432') fail(400, 'invalid_request', 'Only Minecraft is supported');
    if (!CLASSES.has(url.searchParams.get('classId') || '4471')) fail(400, 'invalid_request', 'Unsupported content category');
    url.searchParams.set('gameId', '432'); url.searchParams.set('classId', url.searchParams.get('classId') || '4471');
    return {path: 'mods/search'};
  }
  match = /^\/v1\/mods\/([0-9]+)(\/(description|files)(\/([0-9]+))?)?$/.exec(url.pathname);
  if (!match || !numeric(match[1]) || match[5] && (!numeric(match[5]) || match[3] !== 'files')) fail(404, 'not_found', 'Unknown endpoint');
  validateQuery(url, new Set(match[3] === 'files' && !match[5] ? ['gameVersion', 'modLoaderType', 'index', 'pageSize'] : []));
  return {project: match[1], path: url.pathname.slice(4)};
}
function validateQuery(url, allowed) {
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) fail(400, 'invalid_request', 'Unsupported parameter');
    seen.add(key);
    if (key==='gameVersion'&&!/^[A-Za-z0-9._-]{1,96}$/.test(value)) fail(400,'invalid_request','Invalid Minecraft version');
    if (['pageSize', 'index', 'modLoaderType', 'sortField','categoryId'].includes(key) && !/^\d+$/.test(value)) fail(400, 'invalid_request', 'Invalid numeric parameter');
    if (key === 'pageSize' && (+value < 1 || +value > 50) || key === 'index' && +value > 10000) fail(400, 'invalid_request', 'Pagination is outside the supported range');
    if (key === 'sortOrder' && !['asc', 'desc'].includes(value)) fail(400, 'invalid_request', 'Invalid sort order');
    if (key === 'categoryId' && !numeric(value) || key === 'modLoaderType' && !['0','1','2','3','4','5','6'].includes(value) || key === 'sortField' && !['1','3','6','11'].includes(value)) fail(400, 'invalid_request', 'Unsupported filter');
  }
  if (Number(url.searchParams.get('index') || 0) + Number(url.searchParams.get('pageSize') || 50) > 10000) fail(400, 'invalid_request', 'Pagination exceeds publisher limit');
}
async function signingKey(env) {
  const secret = env.DOWNLOAD_SIGNING_KEY || env.CURSEFORGE_API_KEY;
  const existing = signingKeys.get(env);
  if (existing?.secret === secret) return existing.key;
  const key = crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  signingKeys.set(env, {secret, key});
  return key;
}
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
async function ticket(env, project, file, now) {
  const expiry = Math.floor(now / 1000) + 1800;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`${project}:${file}:${expiry}`));
  return `${expiry}.${hex(signature)}`;
}
async function verifyTicket(env, value, project, file, now) {
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(value || '');
  if (!match || +match[1] < Math.floor(now / 1000) || +match[1] > Math.floor(now / 1000) + 1800) return false;
  const bytes = new Uint8Array(match[2].match(/../g).map(b => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', await signingKey(env), bytes, encoder.encode(`${project}:${file}:${match[1]}`));
}
async function rewriteFiles(value, env, origin, now, permitted = true) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { await Promise.all(value.map(v => rewriteFiles(v, env, origin, now, permitted))); return; }
  permitted = permitted && value.allowModDistribution !== false && value.isAvailable !== false;
  if ('downloadUrl' in value && numeric(String(value.modId)) && numeric(String(value.id))) {
    if (!permitted || typeof value.downloadUrl !== 'string' || !value.downloadUrl) value.downloadUrl = null;
    else {
      let source; try { source = new URL(value.downloadUrl); } catch { source = null; }
      value.downloadUrl = source && cdn(source) ? `${origin}/v1/download/${value.modId}/${value.id}?ticket=${await ticket(env, value.modId, value.id, now)}` : null;
    }
  }
  await Promise.all(Object.values(value).filter(v => v && typeof v === 'object').map(v => rewriteFiles(v, env, origin, now, permitted)));
}

export function createGateway({fetchUpstream = fetch, now = Date.now} = {}) {
  async function api(path, query, env, origin, signal) {
    const budget=await reserve(env,{api:1});if(!budget.ok)fail(budget.status===429?429:503,budget.status===429?'provider_rate_limit':'provider_unavailable','Publisher request budget is unavailable or exhausted');
    const url = new URL(path, API); url.search = query.toString(); url.searchParams.sort();
    const response = await fetchUpstream(url, {cache:'no-store', redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: {'x-api-key': env.CURSEFORGE_API_KEY, 'accept': 'application/json', 'user-agent':'Canary/0.1.8 (+https://github.com/ccardcat/canary; identified server gateway)'}});
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) fail(429, 'provider_rate_limit', 'CurseForge is temporarily rate limited');
      fail(response.status === 404 ? 404 : 503, 'provider_unavailable', 'CurseForge service is temporarily unavailable');
    }
    // Bound JSON metadata, never buffer downloaded game archives.
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try { for (;;) { const {done, value} = await reader.read(); if (done) break; length += value.byteLength; if (length > 8 * 1024 * 1024) fail(502, 'metadata', 'Metadata is too large'); chunks.push(value); } }
    catch (error) { await reader.cancel(); throw error; }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data;
  }
  async function project(id, env, origin, signal) {
    const value = await api(`mods/${id}`, new URLSearchParams(), env, origin, signal);
    if (String(value.data?.id) !== id || value.data?.gameId !== 432 || !CLASSES.has(String(value.data?.classId))) fail(404, 'not_found', 'Minecraft project is not available');
    return value;
  }
  return async function handle(request, env) {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({error: {code: 'method_not_allowed', message: 'Read-only service'}}, 405, {allow: 'GET, HEAD'});
      if (request.url.length > 2048 || [...request.headers].reduce((n,[k,v])=>n+k.length+v.length,0) > 8192 || request.body || Number(request.headers.get('content-length') || 0) > 0) fail(413, 'request_too_large', 'Request is too large or contains a body');
      const url = new URL(request.url); const r = route(url);
      const configured = !!env.CURSEFORGE_API_KEY?.trim();
      const rateLimited = !!(env.API_RATE_LIMIT && env.DOWNLOAD_RATE_LIMIT && env.BUDGET_RATE_LIMIT && env.GATEWAY_BUDGET && configuredBudget(env));
      const approved = env.CURSEFORGE_GATEWAY_APPROVED === 'true';
      const ready = configured && rateLimited && approved;
      if (r.health && !ready) return json({service:'canary-curseforge',protocol:2,configured,rateLimiting:rateLimited,gatewayApproved:approved,ready:false,api:'not_checked',reason:!configured?'missing_key':!rateLimited?'missing_rate_bindings':'terms_approval_required'});
      if (!configured || !rateLimited) fail(503, 'provider_unavailable', 'CurseForge service is not configured');
      if (!approved) fail(403, 'gateway_not_approved', 'Server gateway use requires publisher confirmation');
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const limiter = r.download ? env.DOWNLOAD_RATE_LIMIT : env.API_RATE_LIMIT;
      if (!(await limiter.limit({key: ip})).success || !(await env.BUDGET_RATE_LIMIT.limit({key: 'all'})).success) return json({error: {code: 'provider_rate_limit', message: 'Please try again shortly'}}, 429, {'retry-after': '60'});
      if (r.health) {
        if (url.searchParams.get('check') === 'api') {
          try { await api('mods/search',new URLSearchParams({gameId:'432',classId:'6',pageSize:'1'}),env,url.origin,request.signal); }
          catch(error) { return json({service:'canary-curseforge',protocol:2,configured,rateLimiting:rateLimited,gatewayApproved:approved,ready:false,api:error instanceof Failure && error.status===429?'rate_limited':'unavailable'}); }
          return json({service:'canary-curseforge',protocol:2,configured,rateLimiting:rateLimited,gatewayApproved:approved,ready:true,api:'reachable'});
        }
        return json({service:'canary-curseforge',protocol:2,configured,rateLimiting:rateLimited,gatewayApproved:approved,ready:true,api:'not_checked'});
      }
      const origin = url.origin;
      if (r.download) {
        if (!await verifyTicket(env, url.searchParams.get('ticket'), r.project, r.file, now())) fail(403, 'download_ticket', 'Download link expired; refresh the project');
        const p = await project(r.project, env, origin, request.signal);
        if (p.data.allowModDistribution === false || p.data.isAvailable === false) fail(403, 'manual_download_required', 'The author disabled third-party downloads');
        const metadata = await api(`mods/${r.project}/files/${r.file}`, new URLSearchParams(), env, origin, request.signal);
        if (String(metadata.data?.id) !== r.file || String(metadata.data?.modId) !== r.project) fail(502, 'metadata', 'Project/file mismatch');
        if (metadata.data.isAvailable===false || !metadata.data.downloadUrl) fail(403, 'manual_download_required', 'This file requires manual download');
        let source = new URL(metadata.data.downloadUrl);
        const headers = {'x-api-key': env.CURSEFORGE_API_KEY, 'accept-encoding': 'identity'};
        const size=metadata.data.fileLength;if(!Number.isSafeInteger(size)||size<0||size>MAX_DOWNLOAD)fail(502,'metadata','Invalid download size');
        let expected=size;
        const range = request.headers.get('range');
        if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)fail(400,'invalid_request','Unsupported byte range');
          const start=Number(match[1]),end=match[2]?Number(match[2]):size-1;
          if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=size)fail(400,'invalid_request','Invalid byte range');
          expected=end-start+1;headers.range=`bytes=${start}-${end}`;
        }
        const budget=await reserve(env,{downloads:1,bytes:request.method==='HEAD'?0:expected,lease:request.method!=='HEAD'});
        if(!budget.ok)fail(budget.status===429?429:503,budget.status===429?'provider_rate_limit':'provider_unavailable','Download budget is unavailable or exhausted');
        const lease=budget.lease;let handedOff=false;
        try {
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!cdn(source)) fail(502, 'download_source', 'Unsupported publisher download host');
          const response = await fetchUpstream(source, {cache:'no-store', method: request.method, headers, redirect: 'manual', signal: AbortSignal.any([request.signal,AbortSignal.timeout(300000)])});
          if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel(); if (!location) break; source = new URL(location, source); continue; }
          if (!response.ok) { await response.body?.cancel(); fail(503, 'provider_unavailable', 'Publisher download is temporarily unavailable'); }
          const output = new Headers({'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-type': 'application/octet-stream'});
          for (const name of ['content-length', 'content-range', 'accept-ranges']) if (response.headers.has(name)) output.set(name, response.headers.get(name));
          const declared=response.headers.get('content-length');
          if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)!==expected)||range&&response.status!==206){await response.body?.cancel();fail(502,'download_size','Publisher response does not match the requested size');}
          if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:output});}
          if(!response.body)fail(502,'download_size','Publisher response has no body');
          const reader=response.body.getReader();let received=0,finished=false;
          const finish=async()=>{if(!finished){finished=true;await release(env,lease);}};
          const stream=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();
            if(done){if(received!==expected)throw Error('Download length mismatch');controller.close();await finish();return;}
            received+=value.byteLength;if(received>expected)throw Error('Download exceeds declared size');controller.enqueue(value);
          }catch(error){await reader.cancel().catch(()=>{});controller.error(error);await finish();}},async cancel(reason){await reader.cancel(reason);await finish();}});
          handedOff=true;return new Response(stream,{status:response.status,headers:output});
        }
        fail(502, 'download_source', 'Too many publisher redirects');
        } finally {if(!handedOff)await release(env,lease);}
      }
      if (request.method !== 'GET') return json({error: {code: 'method_not_allowed', message: 'Use GET for metadata'}}, 405);
      let p; if (r.project) p = await project(r.project, env, origin, request.signal);
      const value = r.path === `mods/${r.project}` ? p : await api(r.path, url.searchParams, env, origin, request.signal);
      if (r.path === 'mods/search') value.data = (value.data || []).filter(p => p.gameId === 432 && CLASSES.has(String(p.classId)));
      await rewriteFiles(value, env, origin, now(), p?.data.allowModDistribution !== false && p?.data.isAvailable !== false);
      return json(value);
    } catch (error) {
      if (error instanceof Failure) return json({error: {code: error.code, message: error.message}}, error.status);
      // Never forward publisher error bodies, request headers or secrets to clients.
      return json({error: {code: 'provider_unavailable', message: 'CurseForge service is temporarily unavailable'}}, 503);
    }
  };
}
export default {
  fetch(request, env) { return createGateway()(request, env); }
};
