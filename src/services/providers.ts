import {invoke,isTauri} from "@tauri-apps/api/core";
import {api,searchProjects,type Detail,type Project,type Version} from "./modrinth";
import type {DiscoveryState} from "./discovery";
export type Provider="modrinth"|"curseforge";
export async function providerInvoke<T>(command:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 if(!signal)return invoke<T>(command,args);if(signal.aborted)throw new DOMException("Request cancelled","AbortError");
 const requestId=`provider-${crypto.randomUUID()}`;const cancel=()=>void invoke("cancel_operation",{id:requestId}).catch(()=>{});
 signal.addEventListener("abort",cancel,{once:true});
 try{return await invoke<T>(command,{...args,requestId});}finally{signal.removeEventListener("abort",cancel);}
}
export async function searchProvider(state:DiscoveryState,signal:AbortSignal){
 if(state.provider==="modrinth")return searchProjects(state.type,state.query,state.sort,(state.page-1)*12,state.filters,signal);
 if(!isTauri())throw Error("CurseForge requires the desktop app and a configured official API key");
 if(state.filters.category||state.filters.environment)throw Error("These Modrinth filters are unavailable in CurseForge. Clear category/environment filters.");
 return providerInvoke<{hits:Project[];total_hits:number}>("catalog_search",{kind:state.type,query:state.query,sort:state.sort,offset:(state.page-1)*12,limit:12,game:state.filters.game,loader:state.filters.loader},signal);
}
export function providerDetail(p:Project,signal?:AbortSignal){return p.provider==="curseforge"?providerInvoke<Detail>("content_project",{project:p.project_id,provider:p.provider},signal):api<Detail>(`project/${p.project_id}`,signal);}
export function providerVersions(p:Project,signal?:AbortSignal){return p.provider==="curseforge"?providerInvoke<Version[]>("catalog_versions",{project:p.project_id,kind:p.project_type||"modpack"},signal):api<Version[]>(`project/${p.project_id}/version`,signal);}
export const providerName=(provider?:string)=>provider==="curseforge"?"CurseForge":"Modrinth";
export const providerSite=(detail:Detail)=>detail.provider==="curseforge"?detail.website_url||`https://www.curseforge.com/minecraft/${detail.project_type==="mod"?"mc-mods":detail.project_type==="modpack"?"modpacks":detail.project_type==="shader"?"shaders":detail.project_type==="datapack"?"data-packs":"texture-packs"}/${detail.slug}`:`https://modrinth.com/${detail.project_type}/${detail.slug}`;
