import {invoke,isTauri} from "@tauri-apps/api/core";
import {api,searchProjects,type Detail,type Project,type Version} from "./modrinth";
import type {DiscoveryState} from "./discovery";
export type Provider="modrinth"|"curseforge";
export async function searchProvider(state:DiscoveryState,signal:AbortSignal){
 if(state.provider==="modrinth")return searchProjects(state.type,state.query,state.sort,(state.page-1)*12,state.filters,signal);
 if(!isTauri())throw Error("CurseForge requires the desktop app and a configured official API key");
 if(state.filters.category||state.filters.environment)throw Error("These Modrinth filters are unavailable in CurseForge. Clear category/environment filters.");
 return invoke<{hits:Project[];total_hits:number}>("catalog_search",{kind:state.type,query:state.query,sort:state.sort,offset:(state.page-1)*12,limit:12,game:state.filters.game,loader:state.filters.loader});
}
export function providerDetail(p:Project,signal?:AbortSignal){return p.provider==="curseforge"?invoke<Detail>("content_project",{project:p.project_id,provider:p.provider}):api<Detail>(`project/${p.project_id}`,signal);}
export function providerVersions(p:Project,signal?:AbortSignal){return p.provider==="curseforge"?invoke<Version[]>("catalog_versions",{project:p.project_id,kind:p.project_type||"modpack"}):api<Version[]>(`project/${p.project_id}/version`,signal);}
export const providerName=(provider?:string)=>provider==="curseforge"?"CurseForge":"Modrinth";
export const providerSite=(detail:Detail)=>detail.provider==="curseforge"?detail.website_url||`https://www.curseforge.com/minecraft/${detail.project_type==="mod"?"mc-mods":detail.project_type==="modpack"?"modpacks":detail.project_type==="shader"?"shaders":detail.project_type==="datapack"?"data-packs":"texture-packs"}/${detail.slug}`:`https://modrinth.com/${detail.project_type}/${detail.slug}`;
