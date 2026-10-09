import {budgetBinding,limits} from './budget-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../src/worker.mjs';

const project = {id: 100, gameId: 432, classId: 6, allowModDistribution: true, name: 'Example mod'};
const file = {id: 200, modId: 100, downloadUrl: 'https://edge.forgecdn.net/files/1/2/mod.jar', fileLength: 3, fileName: 'mod.jar', hashes: [{algo: 1, value: 'publisher-hash'}]};
function fixture() {
  const calls = [];
  const env = {...limits,CURSEFORGE_GATEWAY_APPROVED:'true', CURSEFORGE_API_KEY: 'test-publisher-secret', API_RATE_LIMIT: {limit: async () => ({success: true})}, DOWNLOAD_RATE_LIMIT: {limit: async () => ({success: true})}, BUDGET_RATE_LIMIT: {limit: async () => ({success: true})}};
  env.GATEWAY_BUDGET=budgetBinding(env);
  let clock = 1791450000000;
  const state = {project: structuredClone(project), file: structuredClone(file), upstreamStatus: 200, redirect: null};
  const upstream = async (url, options) => {
    const source = new URL(url); calls.push({url: source.href, options});
    if (state.upstreamStatus !== 200) return new Response('private publisher diagnostic ' + env.CURSEFORGE_API_KEY, {status: state.upstreamStatus});
    if (source.hostname.endsWith('forgecdn.net')) {
      if (state.redirect) return new Response(null, {status: 302, headers: {location: state.redirect}});
      return new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); }}), {headers: {'content-length': '3', 'x-api-key': env.CURSEFORGE_API_KEY, 'set-cookie': 'private'}});
    }
    if (source.pathname === '/v1/categories') return Response.json({data:[{id:411,gameId:432,classId:6,name:'Technology'}]});
    if (source.pathname === '/v1/minecraft/version') return Response.json({data:[{versionString:'1.21.1',approved:true}]});
    if (source.pathname === '/v1/mods/search') return Response.json({data: [{...state.project, latestFiles: [state.file]}], pagination: {totalCount: 1}});
    if (source.pathname === '/v1/mods/100') return Response.json({data: state.project});
    if (source.pathname === '/v1/mods/100/files/200') return Response.json({data: state.file});
    if (source.pathname === '/v1/mods/100/files') return Response.json({data: [state.file], pagination: {totalCount: 1}});
    if (source.pathname === '/v1/mods/100/description') return Response.json({data: '<p>Project description</p>'});
    throw Error('Unexpected upstream route: ' + source);
  };
  const gateway = createGateway({fetchUpstream: upstream, now: () => clock});
  const request = (path, options = {}) => gateway(new Request(new URL(path, 'https://canary.example'), {headers: {'cf-connecting-ip': '192.0.2.1', 'authorization': 'untrusted-client-header'}, ...options}), env);
  return {request, gateway, env, state, calls, advance: ms => {clock += ms;}};
}

test('Minecraft search is authenticated only upstream and signed URLs contain no publisher key', async () => {
  const f = fixture(); const response = await f.request('/v1/mods/search?gameId=432&classId=6&pageSize=12');
  assert.equal(response.status, 200); const body = await response.json();
  assert.match(body.data[0].latestFiles[0].downloadUrl, /^https:\/\/canary.example\/v1\/download\/100\/200\?ticket=/);
  assert.ok(!JSON.stringify(body).includes(f.env.CURSEFORGE_API_KEY));
  assert.equal(f.calls[0].options.headers['x-api-key'], f.env.CURSEFORGE_API_KEY);
  assert.equal(f.calls[0].options.cache,'no-store'); assert.equal(f.calls[0].options.redirect, 'manual'); assert.equal(f.calls[0].options.headers.authorization, undefined);
});
test('signed downloads stream exact bytes and do not forward publisher response secrets', async () => {
  const f = fixture(); const metadata = await (await f.request('/v1/mods/100/files/200')).json();
  const response = await f.request(metadata.data.downloadUrl);
  assert.equal(response.status, 200); assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.equal(response.headers.get('content-length'), '3'); assert.equal(response.headers.get('x-api-key'), null); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(f.calls.at(-1).options.headers['x-api-key'], f.env.CURSEFORGE_API_KEY);
});
test('tampered, missing, expired and wrong-file tickets download nothing', async () => {
  const f = fixture(); const metadata = await (await f.request('/v1/mods/100/files/200')).json(); const url = metadata.data.downloadUrl;
  f.calls.length = 0;
  for (const path of ['/v1/download/100/200', url.replace('/100/200', '/100/201'), url.slice(0, -1) + (url.endsWith('0') ? '1' : '0')]) assert.equal((await f.request(path)).status, 403);
  f.advance(1801000); assert.equal((await f.request(url)).status, 403); assert.equal(f.calls.length, 0);
});
test('restricted projects and files require manual downloads', async () => {
  const f = fixture(); const metadata = await (await f.request('/v1/mods/100/files/200')).json();
  f.state.project.allowModDistribution = false;
  assert.equal((await (await f.request('/v1/mods/100/files/200')).json()).data.downloadUrl, null);
  const refused = await f.request(metadata.data.downloadUrl); assert.equal(refused.status, 403); assert.equal((await refused.json()).error.code, 'manual_download_required');
  f.state.project.allowModDistribution = true; f.state.file.downloadUrl = null;
  assert.equal((await (await f.request('/v1/mods/100/files/200')).json()).data.downloadUrl, null);
  assert.ok(!f.calls.some(c => new URL(c.url).hostname.endsWith('forgecdn.net')));
});
test('arbitrary targets, other games, writes, duplicate parameters and large pages are rejected', async () => {
  const f = fixture();
  for (const path of ['/v1/proxy?url=https://evil.example', '/v1/mods/search?gameId=1', '/v1/mods/search?classId=999', '/v1/mods/search?pageSize=51', '/v1/mods/search?index=0&index=1', '/v1/mods/100/description/200', '/v1/mods/4294967296']) assert.ok((await f.request(path)).status >= 400);
  assert.equal((await f.request('/v1/mods/100', {method: 'POST'})).status, 405); assert.equal(f.calls.length, 0);
  f.state.project.gameId = 1; assert.equal((await f.request('/v1/mods/100/files')).status, 404);
});
test('download URL spoofing and cross-host redirects never receive credentials', async () => {
  const f = fixture(); f.state.file.downloadUrl = 'https://edge.forgecdn.net.evil.example/mod.jar';
  assert.equal((await (await f.request('/v1/mods/100/files/200')).json()).data.downloadUrl, null);
  f.state.file.downloadUrl = file.downloadUrl;
  const metadata = await (await f.request('/v1/mods/100/files/200')).json(); f.state.redirect = 'https://evil.example/steal';
  assert.equal((await f.request(metadata.data.downloadUrl)).status, 502);
  assert.ok(!f.calls.some(c => new URL(c.url).hostname === 'evil.example'));
});
test('missing configuration and rate limits fail before contacting the publisher', async () => {
  const f = fixture(); f.env.API_RATE_LIMIT.limit = async () => ({success: false});
  const limited = await f.request('/v1/mods/100'); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60'); assert.equal(f.calls.length, 0);
  delete f.env.CURSEFORGE_API_KEY; assert.equal((await (await f.request('/health')).json()).ready, false); assert.equal(f.calls.length, 0);
});
test('publisher errors are redacted and do not expose the API key', async () => {
  const f = fixture(); f.state.upstreamStatus = 401;
  const response = await f.request('/v1/mods/100'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes(f.env.CURSEFORGE_API_KEY));
  f.state.upstreamStatus = 429; assert.equal((await f.request('/v1/mods/100')).status, 429);
});

test('metadata is never read from or written to a cache',async()=>{
 const f=fixture();let called=0;
 const gateway=createGateway({fetchUpstream:async()=>{called++;return Response.json({data:[project]});},cache:{match:()=>{throw Error("Cache must not be used");},put:()=>{throw Error("Cache must not be used");}}});
 const req=new Request('https://canary.example/v1/mods/search?classId=6');
 assert.equal((await gateway(req,f.env)).status,200);assert.equal((await gateway(req,f.env)).status,200);assert.equal(called,2);
});
test('unapproved gateway exposes only safe health and never calls CurseForge',async()=>{
 for(const approval of [undefined,'false',false,'TRUE','true ']){
  const f=fixture();f.env.CURSEFORGE_GATEWAY_APPROVED=approval;
  for(const path of ['/health','/health?check=api']){const health=await (await f.request(path)).json();assert.equal(health.ready,false);assert.equal(health.reason,'terms_approval_required');}
  assert.equal((await f.request('/v1/mods/100')).status,403);assert.equal(f.calls.length,0);
 }
});
test('API health distinguishes an authorized publisher from upstream failures',async()=>{
 const f=fixture();assert.equal((await (await f.request('/health?check=api')).json()).api,'reachable');
 f.state.upstreamStatus=401;const health=await (await f.request('/health?check=api')).json();assert.equal(health.ready,false);assert.equal(health.api,'unavailable');assert.ok(!JSON.stringify(health).includes(f.env.CURSEFORGE_API_KEY));
});
test('size limits, bodies and filter ranges are rejected before publisher requests',async()=>{
 const f=fixture();
 for(const path of ['/v1/mods/search?index=9999&pageSize=50','/v1/mods/search?sortField=999','/v1/mods/search?modLoaderType=999','/v1/mods/search?categoryId=0','/v1/mods/search?searchFilter='+('a'.repeat(2100))]){
  assert.ok((await f.request(path)).status>=400);
 }
 assert.equal((await f.request('/v1/mods/100',{headers:{'content-length':'100000'}})).status,413);
 assert.equal((await f.request('/v1/mods/100',{headers:{'x-padding':'a'.repeat(8200)}})).status,413);
 assert.equal(f.calls.length,0);
});

test('specific category and Minecraft version routes are allowed, without arbitrary game access',async()=>{
 const f=fixture();
 assert.equal((await f.request('/v1/categories?gameId=432&classId=6')).status,200);
 assert.equal((await f.request('/v1/minecraft/version?sortDescending=true')).status,200);
 assert.equal((await f.request('/v1/categories?gameId=1&classId=6')).status,400);
 assert.equal((await f.request('/v1/minecraft/version?sortDescending=evil')).status,400);
 assert.equal((await f.request('/v1/categories?gameId=432&classId=6&url=https://evil.example')).status,400);
});


test('each actual publisher API call is charged, including the project/file pair',async()=>{
 const f=fixture();f.env.GATEWAY_API_PER_MINUTE='2';assert.equal((await f.request('/v1/mods/100/files/200')).status,200);
 assert.equal(f.calls.length,2);assert.equal(f.env.GATEWAY_BUDGET.values.get('budget').apiMinute,2);
 assert.equal((await f.request('/v1/mods/100')).status,429);assert.equal(f.calls.length,2);
});
test('global budget outages stop upstream calls and make health unavailable',async()=>{
 const f=fixture();f.env.GATEWAY_BUDGET.get=()=>({fetch:async()=>{throw Error('storage unavailable');}});
 assert.equal((await f.request('/v1/mods/100')).status,503);assert.equal(f.calls.length,0);
 delete f.env.GATEWAY_BUDGET;assert.equal((await (await f.request('/health')).json()).ready,false);
});
test('invalid size, unavailable files and byte budget exhaustion never contact CDN',async()=>{
 const f=fixture();const metadata=await (await f.request('/v1/mods/100/files/200')).json();
 f.state.file.isAvailable=false;assert.equal((await f.request(metadata.data.downloadUrl)).status,403);
 f.state.file.isAvailable=true;f.state.file.fileLength=Number.MAX_SAFE_INTEGER;assert.equal((await f.request(metadata.data.downloadUrl)).status,502);
 f.state.file.fileLength=3;f.env.GATEWAY_BYTES_PER_DAY='2';assert.equal((await f.request(metadata.data.downloadUrl)).status,429);
 assert.ok(!f.calls.some(c=>new URL(c.url).hostname.endsWith('forgecdn.net')));
});
test('unsafe ranges and control characters are rejected in controlled requests',async()=>{
 const f=fixture();const metadata=await (await f.request('/v1/mods/100/files/200')).json();
 for(const range of ['bytes=2-1','bytes=0-999','bytes=999999999999999999999-','bytes=0-1,2-3'])assert.equal((await f.request(metadata.data.downloadUrl,{headers:{range}})).status,400);
 for(const path of ['/v1/mods/search?searchFilter=%00','/v1/mods/search?gameVersion=../../evil'])assert.equal((await f.request(path)).status,400);
 assert.ok(!f.calls.some(c=>new URL(c.url).hostname.endsWith('forgecdn.net')));
});
