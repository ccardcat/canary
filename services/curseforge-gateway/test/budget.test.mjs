import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserve,release} from '../src/budget.mjs';
import {budgetBinding,limits} from './budget-fixture.mjs';
function fixture(extra={}){const env={...limits,...extra};env.GATEWAY_BUDGET=budgetBinding(env);return env;}
test('concurrent requests from separate Worker instances share one exact API budget',async()=>{
 const env=fixture({GATEWAY_API_PER_MINUTE:'20'});
 const responses=await Promise.all(Array.from({length:100},()=>reserve(env,{api:1})));
 assert.equal(responses.filter(r=>r.ok).length,20);assert.equal(responses.filter(r=>r.status===429).length,80);
 assert.equal(env.GATEWAY_BUDGET.values.get('budget').apiDay,20);
});
test('byte and concurrent transfer ceilings are reserved before a stream starts',async()=>{
 const env=fixture({GATEWAY_BYTES_PER_DAY:'10',GATEWAY_CONCURRENT_DOWNLOADS:'1'});
 const first=await reserve(env,{bytes:4,downloads:1,lease:true});assert.ok(first.ok);
 assert.equal((await reserve(env,{bytes:4,downloads:1,lease:true})).status,429);
 await release(env,first.lease);assert.ok((await reserve(env,{bytes:6,downloads:1,lease:true})).ok);
 assert.equal((await reserve(env,{bytes:1})).status,429);
});
test('missing/invalid operator quotas fail closed',async()=>{
 const env=fixture({GATEWAY_API_PER_DAY:'0'});assert.equal((await reserve(env,{api:1})).status,503);
});
