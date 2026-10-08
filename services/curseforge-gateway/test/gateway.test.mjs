import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../src/worker.mjs';

const project = {id: 100, gameId: 432, classId: 6, allowModDistribution: true, name: 'Example mod'};
const file = {id: 200, modId: 100, downloadUrl: 'https://edge.forgecdn.net/files/1/2/mod.jar', fileLength: 3, fileName: 'mod.jar', hashes: [{algo: 1, value: 'publisher-hash'}]};
function fixture() {
  const calls = [];
  const env = {CURSEFORGE_API_KEY: 'test-publisher-secret', API_RATE_LIMIT: {limit: async () => ({success: true})}, DOWNLOAD_RATE_LIMIT: {limit: async () => ({success: true})}, BUDGET_RATE_LIMIT: {limit: async () => ({success: true})}};
  let clock = 1791450000000;
  const state = {project: structuredClone(project), file: structuredClone(file), upstreamStatus: 200, redirect: null};
  const upstream = async (url, options) => {
    const source = new URL(url); calls.push({url: source.href, options});
    if (state.upstreamStatus !== 200) return new Response('private publisher diagnostic ' + env.CURSEFORGE_API_KEY, {status: state.upstreamStatus});
    if (source.hostname.endsWith('forgecdn.net')) {
      if (state.redirect) return new Response(null, {status: 302, headers: {location: state.redirect}});
      return new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); }}), {headers: {'content-length': '3', 'x-api-key': env.CURSEFORGE_API_KEY, 'set-cookie': 'private'}});
    }
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
  assert.equal(f.calls[0].options.redirect, 'manual'); assert.equal(f.calls[0].options.headers.authorization, undefined);
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
  delete f.env.CURSEFORGE_API_KEY; assert.equal((await f.request('/health')).status, 503); assert.equal(f.calls.length, 0);
});
test('publisher errors are redacted and do not expose the API key', async () => {
  const f = fixture(); f.state.upstreamStatus = 401;
  const response = await f.request('/v1/mods/100'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes(f.env.CURSEFORGE_API_KEY));
  f.state.upstreamStatus = 429; assert.equal((await f.request('/v1/mods/100')).status, 429);
});
test('raw metadata cache regenerates tickets and preserves publisher restrictions', async () => {
  const f = fixture(); const entries = new Map();
  const cache = {match: async key => entries.get(key.url)?.clone(), put: async (key, response) => entries.set(key.url, response)};
  const gateway = createGateway({fetchUpstream: async (url, options) => { f.calls.push({url: String(url), options}); return Response.json({data: [{...project, latestFiles: [file]}]}); }, cache, now: Date.now});
  const req = new Request('https://canary.example/v1/mods/search?classId=6');
  await gateway(req, f.env); await gateway(req, f.env); assert.equal(f.calls.length, 1);
  const cached = await [...entries.values()][0].clone().json(); assert.equal(cached.data[0].latestFiles[0].downloadUrl, file.downloadUrl);
});
