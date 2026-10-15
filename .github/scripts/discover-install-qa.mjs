import assert from 'node:assert/strict';

export async function discoverInstallQA({evaluate,invoke,click,textButton,until,screenshot,report}) {
 // Exercise the real public Modrinth flow, without network or IPC fixtures.
 // Network unavailability is evidence of a blocked live test, not a fake pass.
 await click(`document.querySelector('.sidebar button[aria-label="Discover"]')`);await until(()=>evaluate(`!!document.querySelector('.discover-page')`),'live Discover');
 await click(textButton('.type-tabs button','Modpacks'));
 try{await until(()=>evaluate(`document.querySelectorAll('.discover-page .project-card').length>=5||!!document.querySelector('.discover-page [role="alert"]')`),'live Modrinth results',45000);}catch(error){report.liveDiscover={status:'blocked',reason:`Live Modrinth results unavailable: ${error}`,mocked:false};return;}
 if(await evaluate(`!!document.querySelector('.discover-page [role="alert"]')`)) {
  report.liveDiscover={status:'blocked',reason:await evaluate(`document.querySelector('.discover-page [role="alert"]').textContent`),mocked:false};
 }else{
  const beforeInstall=await invoke('backend_snapshot');
  const project=await evaluate(`document.querySelector('.discover-page .project-card:has(.install-action:not(:disabled))').dataset.projectId`);
  const selector=`.discover-page .project-card[data-project-id="${project}"]`;
  await click(`document.querySelector(${JSON.stringify(selector+' .install-action')})`);
  await until(()=>evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.dataset.taskId`),'live project task');
  const taskId=await evaluate(`document.querySelector(${JSON.stringify(selector)}).dataset.taskId`);
  const mapping=await evaluate(`[...document.querySelectorAll('.discover-page .project-card')].map(card=>({project:card.dataset.projectId,task:card.dataset.taskId,label:card.querySelector('.install-action')?.textContent.trim()}))`);
  assert.ok(mapping.length>=5);assert.equal(mapping.filter(card=>card.task).length,1);assert.equal(mapping.find(card=>card.task)?.project,project);assert.equal(mapping.filter(card=>/^Installing(?:\\s|$)/.test(card.label??'')).length,1);
  await screenshot('live-discover-one-project-installing');
  let nativeTask,handoffIssue;
  // Wait until version resolution has actually reached the Rust task registry.
  // A real network failure may finish the frontend task before that point.
  try{await until(async()=>{const snapshot=await invoke('backend_snapshot');nativeTask=snapshot.tasks.find(task=>task.id===taskId);return !!nativeTask||await evaluate(`!document.querySelector(${JSON.stringify(selector)})?.dataset.taskId`);},'live native installation handoff',45000);}catch(error){handoffIssue=String(error);}
  await click(`document.querySelector('.sidebar button[aria-label="Downloads"]')`);await until(()=>evaluate(`!!document.querySelector('.activity-downloads')`),'live Downloads');
  const row=`.activity-task[data-task-id="${taskId}"]`;
  const cancellable=await evaluate(`!!document.querySelector(${JSON.stringify(row+' .activity-cancel:not(:disabled)')})`);
  if(cancellable)await click(`document.querySelector(${JSON.stringify(row+' .activity-cancel')})`);
  await until(()=>evaluate(`['cancelled','failed','completed'].includes(document.querySelector(${JSON.stringify(row)})?.dataset.taskStatus)`),'live terminal state',60000);
  const terminal=await evaluate(`document.querySelector(${JSON.stringify(row)}).dataset.taskStatus`);
  const afterInstall=await invoke('backend_snapshot');
  if(terminal!=='completed')assert.deepEqual(afterInstall.instances,beforeInstall.instances,'Failed/cancelled install must not publish a ghost instance');
  if(nativeTask){assert.equal(nativeTask.provider,'modrinth');assert.equal(nativeTask.projectId,project.split(':')[1]);assert.ok(nativeTask.versionId);assert.equal(afterInstall.tasks.find(task=>task.id===taskId)?.status,terminal);}
  await click(`document.querySelector('.sidebar button[aria-label="Discover"]')`);await until(()=>evaluate(`document.querySelectorAll('.discover-page .project-card').length>=5`),'return live Discover');
  assert.equal(await evaluate(`document.querySelectorAll('.discover-page .project-card[data-task-id]').length`),0);await screenshot('live-discover-terminal-cleanup');
  report.liveDiscover={status:nativeTask?'success':'blocked',reason:nativeTask?undefined:handoffIssue||'Live version lookup failed before native installation handoff',mocked:false,project,taskId,versionId:nativeTask?.versionId,cards:mapping.length,installingCards:1,nativeIPC:!!nativeTask,terminal,ghostInstance:false};
 }
}
