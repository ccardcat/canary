import {invoke,isTauri} from "@tauri-apps/api/core";
import {api,searchProjects,type Detail,type Project,type Version} from "./modrinth";
import type {DiscoveryState} from "./discovery";
export type Provider="modrinth"|"curseforge";
export const providers = {
 modrinth: {name:"Modrinth", status:"available"},
 curseforge: {name:"CurseForge", status:"comingSoon"},
} as const;
export const availableProviders = Object.entries(providers).filter(([,p])=>p.status === "available").map(([id])=>id);
export const providerCopy = {
 ru: {title:"CurseForge пока недоступен", description:"Поддержка CurseForge появится в одном из следующих обновлений Canary."},
 en: {title:"CurseForge is not available yet", description:"CurseForge support is coming in a future Canary update."},
};
export const providerAvailable = (provider?:string) => !provider || !(provider in providers) || providers[provider as Provider].status === "available";
export function requireAvailableProvider(provider?:string) {
 if (!providerAvailable(provider)) throw Object.assign(new Error(providerCopy.en.title), {code:"provider_coming_soon"});
}
export async function providerInvoke<T>(command:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 requireAvailableProvider(args.provider as string | undefined);
 if(!signal)return invoke<T>(command,args);if(signal.aborted)throw new DOMException("Request cancelled","AbortError");
 const requestId=`provider-${crypto.randomUUID()}`;const cancel=()=>void invoke("cancel_operation",{id:requestId}).catch(()=>{});
 signal.addEventListener("abort",cancel,{once:true});
 try{return await invoke<T>(command,{...args,requestId});}finally{signal.removeEventListener("abort",cancel);}
}
export async function searchProvider(state:DiscoveryState,signal:AbortSignal){
 if(!providerAvailable(state.provider))return {hits:[] as Project[],total_hits:0};
 if(state.provider==="modrinth")return searchProjects(state.type,state.query,state.sort,(state.page-1)*12,state.filters,signal);
 if(!isTauri())throw Error("CurseForge requires the desktop app");
 return providerInvoke<{hits:Project[];total_hits:number}>("catalog_search",{provider:state.provider,kind:state.type,query:state.query,sort:state.sort,offset:(state.page-1)*12,limit:12,game:state.filters.game,loader:state.filters.loader},signal);
}
export async function providerDetail(p:Project,signal?:AbortSignal){requireAvailableProvider(p.provider);return p.provider==="curseforge"?providerInvoke<Detail>("content_project",{project:p.project_id,provider:p.provider},signal):api<Detail>(`project/${p.project_id}`,signal);}
export async function providerVersions(p:Project,signal?:AbortSignal){requireAvailableProvider(p.provider);return p.provider==="curseforge"?providerInvoke<Version[]>("catalog_versions",{provider:p.provider,project:p.project_id,kind:p.project_type||"modpack"},signal):api<Version[]>(`project/${p.project_id}/version`,signal);}
export const providerName=(provider?:string)=>provider==="curseforge"?"CurseForge":"Modrinth";
export const providerSite=(detail:Detail)=>detail.provider==="curseforge"?detail.website_url||`https://www.curseforge.com/minecraft/${detail.project_type==="mod"?"mc-mods":detail.project_type==="modpack"?"modpacks":detail.project_type==="shader"?"shaders":detail.project_type==="datapack"?"data-packs":"texture-packs"}/${detail.slug}`:`https://modrinth.com/${detail.project_type}/${detail.slug}`;
