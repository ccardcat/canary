import {InlineError} from "./InlineError";
import {useLiveTasks} from "../services/taskStore";
import {TaskRow,TaskCancel} from "./TaskActivity";
import {isTerminal} from "../services/activity";
import GlassSelect from "./GlassSelect";
import {useEffect,useRef,useState} from "react";
import {useBackend,type RuntimeInstance} from "../services/backend";
import {backendMessages} from "../locales/backend";
import {RuntimeDialog} from "./RuntimeDialog";
const modLoaders=["fabric","quilt","forge","neoforge"] as const;
type LoaderCatalog={minecraft:string;versions:Record<string,string[]>;failed:string[]};
interface Preview {path:string;name:string;minecraft:string;loader:string;loader_version?:string;version:string;files:number;download_bytes:number;archive_bytes:number;sha256:string}
export function CreateInstance({russian,onClose,onCreated}:{russian:boolean;onClose:()=>void;onCreated:(id:string)=>void}){
 const text=backendMessages[russian?"ru":"en"];const label=(en:string,ru:string)=>russian?ru:en;
 const {run}=useBackend();const tasks=useLiveTasks();const [versions,setVersions]=useState<{id:string}[]>([]);const [version,setVersion]=useState("");const [loader,setLoader]=useState("vanilla");const [catalog,setCatalog]=useState<LoaderCatalog>({minecraft:"",versions:{},failed:[]});const [check,setCheck]=useState(0);const [selected,setSelected]=useState("");const [name,setName]=useState("");const [busy,setBusy]=useState(false);const [picking,setPicking]=useState(false);const [pack,setPack]=useState<Preview|null>(null);const [issue,setIssue]=useState<unknown>(null);const [request,setRequest]=useState("");
 const active=useRef(false);const mounted=useRef(true);const operation=useRef("");
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[run]);
 useEffect(()=>{let live=true;void run<{id:string}[]>("minecraft_versions",undefined,{reportError:false}).then(list=>{if(live){setVersions(list);setVersion(list[0]?.id||"");}}).catch(e=>{if(live)setIssue(e);});return()=>{live=false;};},[run]);
 useEffect(()=>{
  let live=true;setCatalog({minecraft:"",versions:{},failed:[]});
  if(version)void Promise.allSettled(modLoaders.map(loader=>run<{loader:{version:string}}[]>("loader_versions",{minecraft:version,loader},{reportError:false}))).then(results=>{
   if(!live)return;const values:Record<string,string[]>={};const failed:string[]=[];
   results.forEach((result,i)=>{const loader=modLoaders[i];if(result.status==="fulfilled"){const releases=[...new Set(result.value.map(v=>v.loader.version))];if(releases.length)values[loader]=releases;}else failed.push(loader);});
   setCatalog({minecraft:version,versions:values,failed});setLoader(previous=>values[previous]?previous:"vanilla");
  });
  return()=>{live=false;};
 },[run,version,check]);
 const checking=!!version&&catalog.minecraft!==version;
 const effectiveLoader=catalog.minecraft===version&&catalog.versions[loader]?loader:"vanilla";
 const loaders=catalog.minecraft===version?(catalog.versions[effectiveLoader]||[]):[];
 const effectiveSelected=loaders.includes(selected)?selected:loaders[0]||"";
 const canCreate=!!name.trim()&&(!!pack||!!version&&!checking&&(effectiveLoader==="vanilla"||!!effectiveSelected));
 const close=onClose;
 const selectPack=async()=>{if(active.current)return;active.current=true;setPicking(true);setIssue("");try{const result=await run<Preview|null>("choose_mrpack_file",undefined,{reportError:false});if(mounted.current&&result){setPack(result);setName(result.name);}}catch(e){if(mounted.current)setIssue(e);}finally{active.current=false;if(mounted.current)setPicking(false);}};
 const create=async()=>{
  if(active.current||!canCreate)return;active.current=true;const id=crypto.randomUUID();operation.current=id;setRequest(id);setBusy(true);setIssue("");
  try{const result=await run<RuntimeInstance>(pack?"import_mrpack":"create_instance",pack?{path:pack.path,expectedHash:pack.sha256,name,requestId:id}:{name,minecraft:version,loader:effectiveLoader,loaderVersion:effectiveLoader==="vanilla"?null:effectiveSelected,requestId:id},{reportError:false});if(mounted.current){onCreated(result.id);onClose();}}
  catch(e){if(mounted.current)setIssue(e);}
  finally{active.current=false;operation.current="";if(mounted.current){setBusy(false);}}
 };
 const current=tasks.find(task=>task.operationId===request&&!isTerminal(task));
 return <RuntimeDialog title={text.create} closeLabel={text.close} onClose={close} preventClose={picking}><form className="runtime-panel runtime-create" aria-busy={busy} onSubmit={e=>{e.preventDefault();void create();}}>
  <div className="runtime-inline"><button type="button" className="quiet-button" disabled={busy||picking} onClick={()=>void selectPack()}>{picking?label("Inspecting archive…","Проверка архива…"):label("Import .mrpack","Импорт .mrpack")}</button>{pack&&<button type="button" className="quiet-button" disabled={busy} onClick={()=>setPack(null)}>{label("Create an empty instance","Создать пустой экземпляр")}</button>}</div>
  {pack&&<section className="mrpack-preview" aria-label={label("Pack preview","Предпросмотр сборки")}><b>{pack.name}</b><p>Minecraft {pack.minecraft} · {pack.loader} {pack.loader_version} · {pack.version}</p><p>{pack.files} {text.files} · {(pack.download_bytes/1048576).toFixed(1)} MB</p><small className="selectable">{pack.path}</small></section>}
  <div className="runtime-form"><label>{text.name}<input required maxLength={256} disabled={busy||picking} value={name} onChange={e=>setName(e.target.value)}/></label>{!pack&&<><label>{text.versions}<GlassSelect disabled={busy||picking} value={version} onChange={e=>setVersion(e.target.value)}>{versions.map(v=><option key={v.id}>{v.id}</option>)}</GlassSelect></label><label>{text.loader}<GlassSelect disabled={busy||picking||checking} value={effectiveLoader} onChange={e=>{setLoader(e.target.value);setSelected("");}}>{["vanilla",...modLoaders.filter(l=>catalog.minecraft===version&&catalog.versions[l]?.length)].map(l=><option key={l} value={l}>{l[0].toUpperCase()+l.slice(1)}</option>)}</GlassSelect></label>{effectiveLoader!=="vanilla"&&<label>{text.loaderVersion}<GlassSelect disabled={busy||picking} value={effectiveSelected} onChange={e=>setSelected(e.target.value)}>{loaders.map(l=><option key={l}>{l}</option>)}</GlassSelect></label>}</>}</div>
  {!pack&&checking&&<p role="status">{label("Checking compatible mod loaders…","Проверяем совместимые загрузчики…")}</p>}
  {!pack&&!checking&&catalog.failed.length>0&&<div><InlineError russian={russian} error={{code:"loader_catalog",message:catalog.failed.join(", ")}}/><button type="button" className="quiet-button" disabled={busy||picking} onClick={()=>setCheck(value=>value+1)}>{label("Retry loader check","Повторить проверку загрузчиков")}</button></div>}
  {busy&&current&&<div className="install-progress"><TaskRow task={current} russian={russian} cancelAction={false}/></div>}
  {!!issue&&<InlineError error={issue} russian={russian}/>}
  <div className="install-dialog-actions"><button className="primary-button" disabled={busy||picking||!canCreate}>{busy?text.preparing:pack?label("Import and prepare","Импортировать и подготовить"):text.create}</button>{busy&&current&&<TaskCancel task={current} russian={russian}/>}</div>
 </form></RuntimeDialog>;
}
