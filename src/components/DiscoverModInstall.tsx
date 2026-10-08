import {useEffect,useState} from 'react';
import {useBackend} from '../services/backend';
import {useLiveTasks} from '../services/taskStore';
import {isTerminal} from '../services/activity';
import {providerInvoke} from '../services/providers';
import type {Project} from '../services/modrinth';
import {RuntimeDialog} from './RuntimeDialog';
import GlassSelect from './GlassSelect';
import {InlineError} from './InlineError';

interface Release {id:string;name:string;version_number:string}
interface Plan {fingerprint:string;items:{name:string;number:string}[];optional:string[]}
export function DiscoverModInstall({project,onClose,onQueued,russian}:{project:Project;onClose:()=>void;onQueued:()=>void;russian:boolean}){
 const {snapshot,run}=useBackend();const tasks=useLiveTasks();
 const instances=(snapshot?.instances||[]).filter(i=>!i.internal&&i.loader!=='vanilla'&&!['running','stopping','unavailable','preparing'].includes(i.status)&&!tasks.some(t=>t.operationId===i.id&&!isTerminal(t)));
 const [id,setId]=useState('');const [version,setVersion]=useState('');const [versions,setVersions]=useState<Release[]>([]);const [plan,setPlan]=useState<Plan|null>(null);const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState<unknown>(null);
 const instance=instances.find(i=>i.id===id);const label=(en:string,ru:string)=>russian?ru:en;
 useEffect(()=>{
  setPlan(null);setVersions([]);setVersion('');setError(null);if(!id)return;
  const controller=new AbortController();setLoading(true);
  void providerInvoke<Release[]>('content_versions',{id,project:project.project_id,kind:'mod',beta:false,provider:project.provider},controller.signal).then(data=>{if(!controller.signal.aborted){setVersions(data);setVersion(data[0]?.id||'');}}).catch(e=>{if(!controller.signal.aborted)setError(e);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[id,project.project_id,project.provider]);
 const request={id,provider:project.provider,project:project.project_id,version,kind:'mod',world:null,beta:false};
 const review=()=>{setBusy(true);setError(null);void run<Plan>('content_preview',request,{reportError:false}).then(setPlan).catch(setError).finally(()=>setBusy(false));};
 const install=()=>{if(!plan||!instance)return;void run('install_content',{...request,fingerprint:plan.fingerprint,name:project.title+' — '+instance.name}).catch(()=>{});onClose();onQueued();};
 return <RuntimeDialog title={label('Install mod in an instance','Установить мод в сборку')} closeLabel={label('Close','Закрыть')} onClose={()=>{if(!busy)onClose();}} preventClose={busy}>
  <p>{project.title}</p>
  {!instances.length&&<p role="status">{label('Create a modded instance first, or stop its running game.','Сначала создайте сборку с загрузчиком модов или остановите запущенную игру.')}</p>}
  <label>{label('Instance','Сборка')}<GlassSelect aria-label={label('Instance','Сборка')} value={id} disabled={busy} onChange={e=>setId(e.target.value)}><option value="">{label('Choose an instance','Выберите сборку')}</option>{instances.map(i=><option key={i.id} value={i.id}>{i.name} · Minecraft {i.minecraft} · {i.loader}</option>)}</GlassSelect></label>
  {id&&<label>{label('Compatible release','Совместимая версия')}<GlassSelect aria-label={label('Compatible release','Совместимая версия')} value={version} disabled={busy||loading} onChange={e=>{setVersion(e.target.value);setPlan(null);}}><option value="">{loading?label('Loading…','Загрузка…'):label('Choose a release','Выберите версию')}</option>{versions.map(v=><option key={v.id} value={v.id}>{v.version_number||v.name}</option>)}</GlassSelect></label>}
  {id&&!loading&&!versions.length&&!error&&<p role="status">{label('No compatible release for this instance.','Для этой сборки нет совместимой версии.')}</p>}
  {error!=null&&<InlineError error={error} russian={russian}/>}
  {plan&&<div className="content-review"><p>{label('The mod and these required dependencies will be installed:','Будут установлены мод и необходимые зависимости:')}</p>{plan.items.map((p,i)=><div className="content-review-row" key={i}>{p.name} · {p.number}</div>)}</div>}
  <div className="runtime-inline">{plan?<button className="primary-button" disabled={!instance||busy} onClick={install}>{label('Confirm installation','Подтвердить установку')}</button>:<button className="primary-button" disabled={!instance||!version||loading||busy} onClick={review}>{busy?label('Resolving…','Проверка…'):label('Review installation','Проверить установку')}</button>}</div>
 </RuntimeDialog>;
}
