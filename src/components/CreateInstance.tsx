import {InlineError} from "./InlineError";
import {useLiveTasks} from "../services/taskStore";
import {TaskRow,TaskCancel} from "./TaskActivity";
import {isTerminal} from "../services/activity";
import GlassSelect from "./GlassSelect";
import {useEffect,useRef,useState} from "react";
import {useBackend,type RuntimeInstance} from "../services/backend";
import {backendMessages} from "../locales/backend";
import {RuntimeDialog} from "./RuntimeDialog";
interface Preview {path:string;name:string;minecraft:string;loader:string;loader_version?:string;version:string;files:number;download_bytes:number;archive_bytes:number;sha256:string}
export function CreateInstance({russian,onClose,onCreated}:{russian:boolean;onClose:()=>void;onCreated:(id:string)=>void}){
 const text=backendMessages[russian?"ru":"en"];const label=(en:string,ru:string)=>russian?ru:en;
 const {run}=useBackend();const tasks=useLiveTasks();const [versions,setVersions]=useState<{id:string}[]>([]);const [version,setVersion]=useState("");const [loader,setLoader]=useState("vanilla");const [loaders,setLoaders]=useState<string[]>([]);const [selected,setSelected]=useState("");const [name,setName]=useState("");const [busy,setBusy]=useState(false);const [picking,setPicking]=useState(false);const [pack,setPack]=useState<Preview|null>(null);const [issue,setIssue]=useState<unknown>(null);const [request,setRequest]=useState("");
 const active=useRef(false);const mounted=useRef(true);const operation=useRef("");
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[run]);
 useEffect(()=>{let live=true;void run<{id:string}[]>("minecraft_versions").then(list=>{if(live){setVersions(list);setVersion(list[0]?.id||"");}}).catch(()=>{});return()=>{live=false;};},[run]);
 useEffect(()=>{let live=true;setLoaders([]);setSelected("");if(loader!=="vanilla"&&version)void run<{loader:{version:string}}[]>("loader_versions",{minecraft:version,loader}).then(list=>{if(live){const values=list.map(v=>v.loader.version);setLoaders(values);setSelected(values[0]||"");}}).catch(()=>{});return()=>{live=false;};},[run,loader,version]);
 const close=onClose;
 const selectPack=async()=>{if(active.current)return;active.current=true;setPicking(true);setIssue("");try{const result=await run<Preview|null>("choose_mrpack_file",undefined,{reportError:false});if(mounted.current&&result){setPack(result);setName(result.name);}}catch(e){if(mounted.current)setIssue(e);}finally{active.current=false;if(mounted.current)setPicking(false);}};
 const create=async()=>{
  if(active.current)return;active.current=true;const id=crypto.randomUUID();operation.current=id;setRequest(id);setBusy(true);setIssue("");
  try{const result=await run<RuntimeInstance>(pack?"import_mrpack":"create_instance",pack?{path:pack.path,expectedHash:pack.sha256,name,requestId:id}:{name,minecraft:version,loader,loaderVersion:loader==="vanilla"?null:selected,requestId:id},{reportError:false});if(mounted.current){onCreated(result.id);onClose();}}
  catch(e){if(mounted.current)setIssue(e);}
  finally{active.current=false;operation.current="";if(mounted.current){setBusy(false);}}
 };
 const current=tasks.find(task=>task.operationId===request&&!isTerminal(task));
 return <RuntimeDialog title={text.create} closeLabel={text.close} onClose={close} preventClose={picking}><form className="runtime-panel runtime-create" aria-busy={busy} onSubmit={e=>{e.preventDefault();void create();}}>
  <div className="runtime-inline"><button type="button" className="quiet-button" disabled={busy||picking} onClick={()=>void selectPack()}>{picking?label("Inspecting archive…","Проверка архива…"):label("Import .mrpack","Импорт .mrpack")}</button>{pack&&<button type="button" className="quiet-button" disabled={busy} onClick={()=>setPack(null)}>{label("Create an empty instance","Создать пустой экземпляр")}</button>}</div>
  {pack&&<section className="mrpack-preview" aria-label={label("Pack preview","Предпросмотр сборки")}><b>{pack.name}</b><p>Minecraft {pack.minecraft} · {pack.loader} {pack.loader_version} · {pack.version}</p><p>{pack.files} {text.files} · {(pack.download_bytes/1048576).toFixed(1)} MB</p><small className="selectable">{pack.path}</small></section>}
  <div className="runtime-form"><label>{text.name}<input required maxLength={256} disabled={busy||picking} value={name} onChange={e=>setName(e.target.value)}/></label>{!pack&&<><label>{text.versions}<GlassSelect disabled={busy||picking} value={version} onChange={e=>setVersion(e.target.value)}>{versions.map(v=><option key={v.id}>{v.id}</option>)}</GlassSelect></label><label>{text.loader}<GlassSelect disabled={busy||picking} value={loader} onChange={e=>setLoader(e.target.value)}>{["vanilla","fabric","quilt","forge","neoforge"].map(l=><option key={l} value={l}>{l[0].toUpperCase()+l.slice(1)}</option>)}</GlassSelect></label>{loader!=="vanilla"&&<label>{text.loaderVersion}<GlassSelect disabled={busy||picking} value={selected} onChange={e=>setSelected(e.target.value)}>{loaders.map(l=><option key={l}>{l}</option>)}</GlassSelect></label>}</>}</div>
  {busy&&current&&<div className="install-progress"><TaskRow task={current} russian={russian} cancelAction={false}/></div>}
  {!!issue&&<InlineError error={issue} russian={russian}/>}
  <div className="install-dialog-actions"><button className="primary-button" disabled={busy||picking||!name.trim()||(!pack&&(!version||(loader!=="vanilla"&&!selected)))}>{busy?text.preparing:pack?label("Import and prepare","Импортировать и подготовить"):text.create}</button>{busy&&current&&<TaskCancel task={current} russian={russian}/>}</div>
 </form></RuntimeDialog>;
}
