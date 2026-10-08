import { type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

export async function nativeFixture(page: Page) {
  mkdirSync(".qa/materials", { recursive: true });
  await page.route("https://api.modrinth.com/**", (route) =>
    route.fulfill({ json: { hits: [], total_hits: 0 } }),
  );
  await page.route("**/src/main.tsx*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body:
        `
import {mockIPC,mockWindows,mockConvertFileSrc} from '/node_modules/@tauri-apps/api/mocks.js';
import {emit} from '/node_modules/@tauri-apps/api/event.js';
globalThis.isTauri=true;mockWindows('main');mockConvertFileSrc('windows');
const settings={backup_before_changes:true,backup_retention:8,log_retention_days:30,update_checks:false,automatic_java:true,min_memory:512,max_memory:4096,jvm_args:[],game_args:[],width:1280,height:720,concurrency:4,fullscreen:false,snapshots:false};
const state={instances:Array.from({length:9},(_,i)=>({id:'instance-'+i,name:i===0?'Fabulously Optimized':'Canary world '+i,provider:'modrinth',version_name:'1.21.1',minecraft:'1.21.1',loader:'fabric',icon:location.origin+'/branding/canary-bird-white.png',directory:'C:/Canary/instances/'+i,installed:9-i,playtime:30,favorite:false,status:i===1?'running':i===2?'failed':'ready',error:i===2?{code:'java_missing',message:'Java required'}:undefined,overrides:{}})),accounts:[{id:'local',uuid:'local',username:'CanaryPlayer',provider:'local',status:'local'},{id:'ms',uuid:'ms',username:'LicensedPlayer',provider:'microsoft',status:'authenticated'}],settings,activity:[],providers:{},physical_memory_mb:65536,data_folder:'C:/Canary'};
globalThis.__materialQA={state,calls:[]};
mockIPC((command,args)=>{
 globalThis.__materialQA.calls.push({command,args});
 if(globalThis.__materialQA.overrides?.[command])return globalThis.__materialQA.overrides[command](args);
 if(command==='backend_snapshot'){
  if(args?.localOnly&&globalThis.__startupQA?.holdSnapshot)return new Promise(resolve=>(globalThis.__startupQA.resolvers ||= []).push(()=>resolve(structuredClone(state))));
  return structuredClone(state);
 }
 if(command==='list_wallpapers')return globalThis.__customWallpapers||[];
 if(command==='game_log_sessions')return [];
 if(command==='read_game_log')return '';
 if(command==='clear_activity'){state.activity=[];return;}
 if(command==='save_backend_settings'){Object.assign(state.settings,args.settings);return;}
 if(command==='scan_screenshots')return [];
 if(command==='content_inventory')return {items:[],history:[],snapshots:[]};
 if(command==='content_worlds')return [];
 if(command==='content_search')return {hits:[{project_id:'sodium',title:'Sodium',description:'A compatible rendering mod',author:'Community',downloads:100,versions:['1.21.1'],categories:['fabric']}],total_hits:1};
 if(command==='content_project')return {id:'sodium',title:'Sodium',description:'Rendering improvements',body:'A readable description.',game_versions:['1.21.1'],loaders:['fabric']};
 if(command==='content_versions')return [{id:'sodium-v1',name:'Sodium 1',version_number:'1',version_type:'release'}];
 if(command==='storage_usage')return {path:'C:/Users/CanaryPlayer/AppData/Roaming/Canary/instances/very-long-folder-name-without-spaces-for-responsive-validation',used:1073741824,free:10737418240,available:true,breakdown:{instances:1073741824,cache:1073741824,java:1073741824,logs:1048576,total:3222274048}};
 if(command==='window_material_capabilities')return globalThis.__startupQA?.nativeCaps||{platform:'windows',build:22621,supported:['solid']};
 if(command==='apply_window_material')return {requested:args.requested,actual:'solid',fallback:false};
 if(command==='minecraft_versions')return [{id:'1.21.1'}];
 if(command==='loader_versions')return [{loader:{version:'0.16.0'}}];
 if(command==='update_instance'){Object.assign(state.instances.find(i=>i.id===args.instance.id),args.instance);return args.instance;}
 if(command==='switch_account'){state.settings.active_account=args.id;return;}
 if(command==='rename_local_account'){state.accounts.find(a=>a.id===args.id).username=args.username;return;}
 if(command==='remove_account'){state.accounts=state.accounts.filter(a=>a.id!==args.id);return;}
 if(command==='launch_instance'){state.instances.find(i=>i.id===args.id).status='running';return 1;}
 if(command==='stop_instance'){state.instances.find(i=>i.id===args.id).status='ready';return;}
 if(command==='install_modpack')return new Promise((resolve,reject)=>{
  const task={id:args.taskId,operationId:args.projectId+'-'+args.versionId,kind:'install',title:args.name,status:'running',stage:'libraries',startedAt:100,updatedAt:100,revision:1,cancellable:true,cancelRequested:false,completed:42,total:100,downloaded:42,bytesTotal:100,percent:42,speed:1,currentFile:'library.jar'};
  (globalThis.__materialQA.installs ||= []).push({args,task,resolve,reject});
  globalThis.__materialQA.emitInstall=async(index,patch)=>{const install=globalThis.__materialQA.installs[index];Object.assign(install.task,patch);await emit('activity-task',structuredClone(install.task));};
  globalThis.__materialQA.completeInstall=index=>{const install=globalThis.__materialQA.installs[index];state.instances.push({...structuredClone(state.instances[0]),id:install.task.operationId,project_id:install.args.projectId,version_id:install.args.versionId,name:install.args.name,status:'ready'});install.resolve('C:/Canary/instances/'+install.task.operationId);};
  globalThis.__materialQA.failInstall=index=>globalThis.__materialQA.installs[index].reject({code:'network',message:'Safe install failure'});
  setTimeout(()=>void emit('activity-task',task),50);
 });
 if(command==='create_instance')return new Promise((resolve,reject)=>{
  globalThis.__materialQA.failCreate=()=>reject({code:'network',message:'Safe QA failure before finalize'});
  globalThis.__materialQA.completeCreate=()=>{const instance={...structuredClone(state.instances[0]),id:args.requestId,name:args.name,status:'ready',error:undefined,directory:'C:/Canary/instances/'+args.requestId};state.instances.push(instance);resolve(instance);};
  globalThis.__materialQA.cancelCreate=()=>{if(globalThis.__materialQA.deferCancel)setTimeout(()=>reject({code:'cancelled',message:'Operation cancelled'}),400);else reject({code:'cancelled',message:'Operation cancelled'});};
  setTimeout(()=>void emit('backend-progress',{id:args.requestId,stage:'libraries',status:'running',completed:43,total:97,downloaded:1048576,bytes_total:2097152,percent:44.3,speed:1024,file:'libraries/minecraft/very-long-library-name-1.21.1.jar'}),50);
 });
 if(command==='cancel_operation'){const install=globalThis.__materialQA.installs?.find(i=>i.args.taskId===args.id);if(install)install.reject({code:'cancelled',message:'Operation cancelled'});else globalThis.__materialQA.cancelCreate?.();return;}
 if(command==='plugin:window|is_maximized'||command==='plugin:window|is_fullscreen')return false;
 return null;
},{shouldMockEvents:true});
` + body,
    });
  });
}
