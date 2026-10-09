import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function validateReleaseSource({run,jobs,artifacts,workflow,sha,tag,windowsOnly,reuse,receipts}){
 if(run.workflow_id!==workflow.id||run.path!=='.github/workflows/release.yml'||!['push','workflow_dispatch'].includes(run.event)||run.pull_requests?.length||!['main',tag].includes(run.head_branch)||run.event==='push'&&run.head_sha!==sha)throw Error('Release run provenance does not match the tagged trusted workflow');
 const builds=jobs.filter(j=>j.name.startsWith('build ('));
 if(reuse&&(run.status!=='completed'||!builds.length||builds.some(j=>j.conclusion!=='success')))throw Error('Reused installer build jobs must have completed successfully');
 if(reuse&&run.conclusion!=='success'&&jobs.some(j=>j.conclusion==='failure'&&j.name!=='publish'))throw Error('Reused run failed outside publication');
 const expected=windowsOnly?['canary-windows-x64']:['canary-windows-x64','canary-linux-x64'];
 for(const name of expected){const matches=artifacts.filter(a=>a.name===name);if(matches.length!==1||matches[0].expired||!Number.isSafeInteger(matches[0].size_in_bytes)||matches[0].size_in_bytes<=0||matches[0].size_in_bytes>2*1024**3||matches[0].workflow_run&&matches[0].workflow_run.head_sha!==run.head_sha)throw Error(`Missing, ambiguous or untrusted installer artifact: ${name}`);}
 if(receipts){for(const name of expected){const matches=receipts.filter(r=>`canary-${r.platform}`===name);if(matches.length!==1||matches[0].commit!==sha||matches[0].tag!==tag||String(matches[0].run_id)!==String(run.id)||matches[0].workflow_sha!==run.head_sha)throw Error('Installer receipt differs from its tagged source or workflow run');}}
 return true;
}
async function main(){
 const {GITHUB_REPOSITORY:repo,GH_TOKEN:token,RELEASE_TAG:tag,REUSE_RUN:reuse,GITHUB_RUN_ID:current,WINDOWS_ONLY:windows}=process.env;
 if(!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(tag||'')||!/^\d+$/.test(reuse||current||'')||!/^[-\w]+\/[-\w]+$/.test(repo||''))throw Error('Invalid release tag, repository or run');
 const version=tag.slice(1);for(const path of ['package.json','src-tauri/tauri.conf.json'])if(JSON.parse(readFileSync(path,'utf8')).version!==version)throw Error('Release version differs from tagged source');
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const id=reuse||current;
 const api=async path=>{const response=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Cannot verify release metadata (${response.status})`);return response.json();};
 const [run,workflow,jobs,artifacts]=await Promise.all([api(`actions/runs/${id}`),api('actions/workflows/release.yml'),api(`actions/runs/${id}/jobs?per_page=100`),api(`actions/runs/${id}/artifacts?per_page=100`)]);
 let receipts;
 if(process.argv.includes('--receipts')||process.argv.includes('--files')){
  const folder=process.env.CANARY_RELEASE_PROVENANCE;
  receipts=readdirSync(folder).map(name=>JSON.parse(readFileSync(join(folder,name,'provenance.json'),'utf8'))).filter(r=>windows!=='true'||r.platform==='windows-x64');
  if(!receipts.length)throw Error('Release source receipts are mandatory; rebuild historical artifacts without receipts');
 }
 validateReleaseSource({run,workflow,jobs:jobs.jobs,artifacts:artifacts.artifacts,sha,tag,windowsOnly:windows==='true',reuse:!!reuse,receipts});
 if(process.argv.includes('--files')){
  const folder=process.env.CANARY_INSTALLERS;
  const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(path,e.name)):[join(path,e.name)]);
  const downloaded=walk(folder);const expected=new Set(receipts.flatMap(r=>r.files.map(f=>f.name)));if(downloaded.some(path=>!expected.has(path.split(/[\\/]/).pop()))||downloaded.length!==expected.size)throw Error('Unexpected installer files outside build receipts');
  for(const receipt of receipts){for(const file of receipt.files){const matches=downloaded.filter(path=>path.split(/[\\/]/).pop()===file.name);if(matches.length!==1||createHash('sha256').update(readFileSync(matches[0])).digest('hex')!==file.sha256)throw Error('Installer content differs from its build receipt');}}
 }
 console.log('Installer provenance matches the tagged commit and completed trusted build jobs.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Release provenance verification failed. Publication stopped.');process.exitCode=1;});
