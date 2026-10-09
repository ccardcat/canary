import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseSource} from './verify-release-source.mjs';
const fixture=()=>({sha:'tagged-commit',tag:'v0.1.8',windowsOnly:true,reuse:true,workflow:{id:42},run:{id:7,head_branch:'v0.1.8',head_sha:'tagged-commit',workflow_id:42,path:'.github/workflows/release.yml',event:'push',status:'completed',conclusion:'success',pull_requests:[]},jobs:[{name:'build (windows-latest, windows)',conclusion:'success'}],artifacts:[{name:'canary-windows-x64',size_in_bytes:123,expired:false,workflow_run:{head_sha:'tagged-commit'}}]});
test('tagged successful builds and a failed publication retry are accepted',()=>{const value=fixture();assert.ok(validateReleaseSource(value));value.run.conclusion='failure';value.jobs.push({name:'publish',conclusion:'failure'});assert.ok(validateReleaseSource(value));});
test('another commit/workflow, a PR, failed build, expired or duplicate artifact is rejected',()=>{
 const attacks=[v=>v.run.head_sha='attacker-commit',v=>v.run.workflow_id=99,v=>v.run.event='pull_request',v=>v.run.pull_requests=[{number:1}],v=>v.jobs[0].conclusion='failure',v=>v.artifacts[0].expired=true,v=>v.artifacts.push({...v.artifacts[0]}),v=>v.artifacts[0].workflow_run.head_sha='other-commit'];
 for(const change of attacks){const value=fixture();change(value);assert.throws(()=>validateReleaseSource(value));}
});

test('dispatch checks the actual tagged build receipt even when workflow SHA differs',()=>{const value=fixture();value.run.event='workflow_dispatch';value.run.head_branch='main';value.run.head_sha='trusted-policy-commit';value.artifacts[0].workflow_run.head_sha='trusted-policy-commit';value.receipts=[{platform:'windows-x64',commit:'tagged-commit',tag:'v0.1.8',run_id:7,workflow_sha:'trusted-policy-commit'}];assert.ok(validateReleaseSource(value));value.receipts[0].commit='another-build';assert.throws(()=>validateReleaseSource(value));});
