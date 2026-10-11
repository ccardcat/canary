import {useState} from "react";
import {CircleAlert,WifiOff,LockKeyhole,RotateCcw} from "lucide-react";
import {useBackend} from "../services/backend";
import {useLiveTasks} from "../services/taskStore";
import {isTerminal,type ActivityTask} from "../services/activity";
import {errorCopy,technicalDetails} from "../services/errors";
import {RuntimeDialog} from "./RuntimeDialog";
import {TaskRow} from "./TaskActivity";
import {ErrorSupport} from "./ErrorSupport";
export function ErrorDialog({russian}:{russian:boolean}){
 const {error,clearError,retryError,snapshot,run}=useBackend();const tasks=useLiveTasks();
 if(!error)return null;
 return <ErrorContent key={technicalDetails(error)} error={error} russian={russian} clear={clearError} retry={retryError} instances={snapshot?.instances??[]} tasks={tasks} run={run}/>;
}
function ErrorContent({error,russian,clear,retry,instances,tasks,run}:{error:unknown;russian:boolean;clear:()=>void;retry:()=>Promise<unknown>;instances:{id:string;name:string;status?:string;minecraft?:string;loader?:string}[];tasks:ActivityTask[];run:ReturnType<typeof useBackend>["run"]}){
 const {title,message,hint,detail,family}=errorCopy(error,russian);const [working,setWorking]=useState(false),[force,setForce]=useState(false);
 const stop=detail.code==="stop_pending"||detail.code==="stop_failed";
 const Icon=family==="network"?WifiOff:family==="auth"?LockKeyhole:CircleAlert;
 const instance=instances.find(i=>i.id===detail.instance_id),task=tasks.find(t=>t.id===detail.task_id);
 const subject=instance?.name??task?.title??(typeof detail.subject==="string"?detail.subject:undefined);
 const resource=["tasksRunning","resource","operationActive","storageInUse","finalizing"].includes(family);
 const active=resource?tasks.filter(t=>!isTerminal(t)&&(!detail.instance_id||detail.code==="tasks_running"||detail.code==="storage_in_use"||t.instanceId===detail.instance_id||t.id===detail.task_id)):[];
 const games=family==="gameRunning"||family==="accountGame"?instances.filter(i=>["running","stopping"].includes(i.status??"")):[];
 return <RuntimeDialog title={stop?(russian?"Minecraft ещё работает":"Minecraft is still running"):title} closeLabel={russian?"Закрыть":"Close"} onClose={clear}>
 <div className="error-description"><Icon size={24} aria-hidden="true"/><div>
 {subject&&<p className="error-subject"><span>{russian?"Сборка или действие":"Affected instance or action"}</span><b>{subject}</b>{instance?.minecraft&&<small>Minecraft {instance.minecraft}{instance.loader?` · ${instance.loader}`:""}</small>}</p>}
 <h4 className="error-section-label">{russian?"Почему возникла ошибка":"Why it happened"}</h4><p>{stop?(russian?"Minecraft не завершился. Игра всё ещё работает с файлами экземпляра.":"Minecraft has not closed and is still using instance files."):message}</p>
 <h4 className="error-section-label">{russian?"Как исправить":"How to fix it"}</h4><p className="settings-note">{stop?(russian?"Сохраните мир и закройте игру обычным способом. Принудительная остановка может потерять несохранённый прогресс.":"Save your world and close the game normally. Force stop can lose unsaved progress."):detail.code==="tasks_running"&&!active.length?(russian?"Подождите несколько секунд и проверьте раздел «Загрузки»: операция могла уже завершиться. Затем попробуйте закрыть Canary ещё раз. Если сообщение остаётся, скопируйте сведения для поддержки.":"Wait a few seconds and check Downloads: the operation may have already finished. Try closing Canary again. If the message remains, copy the support details."):hint}</p>
 </div></div>
 {active.length>0&&<section className="error-active-operations" aria-label={russian?"Что сейчас используется":"What is currently in use"}><h4>{russian?"Активные операции":"Active operations"}</h4>{active.map(t=><TaskRow key={t.id} task={t} russian={russian}/>)}</section>}
 {games.length>0&&<div className="error-running-games"><h4>{russian?"Сейчас запущено":"Currently running"}</h4><ul>{games.map(i=><li key={i.id}><b>{i.name}</b>{i.minecraft?` · Minecraft ${i.minecraft}`:""}</li>)}</ul></div>}
 <ErrorSupport error={error} russian={russian}/>
 <div className="runtime-inline">{detail.retryable&&detail.retry_available&&<button className="primary-button" disabled={working} onClick={()=>{setWorking(true);void retry().catch(()=>{}).finally(()=>setWorking(false));}}><RotateCcw size={15}/>{russian?"Повторить":"Retry"}</button>}
 {stop&&detail.instance_id&&<><button className="primary-button" disabled={working} onClick={()=>{setWorking(true);void run("stop_instance",{id:detail.instance_id,force:false}).then(clear).catch(()=>{}).finally(()=>setWorking(false));}}>{russian?"Подождать":"Wait"}</button><button className="quiet-button destructive" onClick={()=>setForce(true)}>{russian?"Принудительная остановка":"Force stop"}</button></>}
 <button className="quiet-button" onClick={clear}>{russian?"Закрыть":"Close"}</button></div>
 {force&&<RuntimeDialog title={russian?"Остановить Minecraft принудительно?":"Force stop Minecraft?"} closeLabel={russian?"Отмена":"Cancel"} onClose={()=>setForce(false)}><p>{russian?"Несохранённые изменения мира могут быть потеряны.":"Unsaved world changes may be lost."}</p><button className="primary-button" onClick={()=>void run("stop_instance",{id:detail.instance_id,force:true}).then(clear).catch(()=>{})}>{russian?"Остановить":"Stop"}</button></RuntimeDialog>}
 </RuntimeDialog>;
}
