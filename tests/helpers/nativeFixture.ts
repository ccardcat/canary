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
const state={instances:Array.from({length:9},(_,i)=>({id:'instance-'+i,name:i===0?'Fabulously Optimized':'Canary world '+i,provider:'modrinth',version_name:'1.21.1',minecraft:'1.21.1',loader:'fabric',icon:location.origin+'/branding/canary-bird-white.png',directory:'C:/Canary/instances/'+i,installed:9-i,playtime:30,favorite:false,status:i===1?'running':i===2?'failed':'ready',error:i===2?{code:'java_missing',message:'Java required'}:undefined,overrides:{}})),accounts:[{id:'local',uuid:'local',username:'CanaryPlayer',provider:'local',status:'local'},{id:'ms',uuid:'ms',username:'LicensedPlayer',provider:'microsoft',status:'authenticated'}],settings,activity:[],providers:{},data_folder:'C:/Canary'};
globalThis.__materialQA={state,calls:[]};
mockIPC((command,args)=>{
 globalThis.__materialQA.calls.push({command,args});
 if(command==='backend_snapshot')return structuredClone(state);
 if(command==='list_wallpapers')return [];
 if(command==='window_material_capabilities')return {platform:'windows',build:22621,supported:['solid']};
 if(command==='apply_window_material')return {requested:args.requested,actual:'solid',fallback:false};
 if(command==='minecraft_versions')return [{id:'1.21.1'}];
 if(command==='update_instance'){Object.assign(state.instances.find(i=>i.id===args.instance.id),args.instance);return args.instance;}
 if(command==='switch_account'){state.settings.active_account=args.id;return;}
 if(command==='rename_local_account'){state.accounts.find(a=>a.id===args.id).username=args.username;return;}
 if(command==='remove_account'){state.accounts=state.accounts.filter(a=>a.id!==args.id);return;}
 if(command==='launch_instance'){state.instances.find(i=>i.id===args.id).status='running';return 1;}
 if(command==='stop_instance'){state.instances.find(i=>i.id===args.id).status='ready';return;}
 if(command==='create_instance')return new Promise((resolve,reject)=>{
  globalThis.__materialQA.cancelCreate=()=>reject({code:'cancelled',message:'Operation cancelled'});
  setTimeout(()=>void emit('backend-progress',{id:args.requestId,stage:'libraries',status:'running',completed:43,total:97,downloaded:1048576,bytes_total:2097152,percent:44.3,speed:1024,file:'libraries/minecraft/very-long-library-name-1.21.1.jar'}),50);
 });
 if(command==='cancel_operation'){globalThis.__materialQA.cancelCreate?.();return;}
 if(command==='plugin:window|is_maximized'||command==='plugin:window|is_fullscreen')return false;
 return null;
},{shouldMockEvents:true});
` + body,
    });
  });
}
