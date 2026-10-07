import {useState} from "react";
import {CircleAlert,WifiOff,LockKeyhole,Copy,RotateCcw} from "lucide-react";
import {useBackend} from "../services/backend";
import {errorCopy,technicalDetails} from "../services/errors";
import {RuntimeDialog} from "./RuntimeDialog";
export function ErrorDialog({russian}:{russian:boolean}){
 const {error,clearError,retryError,snapshot,run}=useBackend();
 if(!error)return null;return <ErrorContent key={technicalDetails(error)} error={error} russian={russian} clear={clearError} retry={retryError} instances={snapshot?.instances??[]} run={run}/>;
}
function ErrorContent({error,russian,clear,retry,instances,run}:{error:unknown;russian:boolean;clear:()=>void;retry:()=>Promise<unknown>;instances:{id:string;name:string}[];run:ReturnType<typeof useBackend>["run"]}){
 const {title,message,hint,detail,family}=errorCopy(error,russian);const [copied,setCopied]=useState(false);const [working,setWorking]=useState(false);const [force,setForce]=useState(false);
 const stop=detail.code==="stop_pending"||detail.code==="stop_failed";
 const Icon=family==="network"?WifiOff:family==="auth"?LockKeyhole:CircleAlert;
 const rows=[[russian?"Код":"Code",detail.code],[russian?"Этап":"Stage",detail.stage],[russian?"Экземпляр":"Instance",instances.find(i=>i.id===detail.instance_id)?.name],["Task ID",detail.task_id],[russian?"Повтор":"Retry",detail.retryable&&detail.retry_available?(russian?"да":"yes"):(russian?"нет":"no")]];
 return <RuntimeDialog title={stop?(russian?"Minecraft ещё работает":"Minecraft is still running"):title} closeLabel={russian?"Закрыть":"Close"} onClose={clear}>
 <div className="error-description"><Icon size={24} aria-hidden="true"/><div><p>{stop?(russian?"Minecraft не завершился. Сохраните мир и закройте игру обычным способом.":"Minecraft has not closed. Save your world and close the game normally."):message}</p><p className="settings-note">{stop?(russian?"Принудительная остановка может потерять несохранённый прогресс.":"Force stop can lose unsaved progress."):hint}</p></div></div>
 <details className="error-details"><summary>{russian?"Подробнее":"Details"}</summary><dl>{rows.filter(([,value])=>value!=null).map(([key,value])=><div key={String(key)}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{detail.message&&<p className="selectable error-technical-message">{detail.message}</p>}<button className="quiet-button" onClick={()=>void navigator.clipboard.writeText(technicalDetails(error)).then(()=>setCopied(true)).catch(()=>setCopied(false))}><Copy size={14}/>{copied?(russian?"Скопировано":"Copied"):(russian?"Копировать сведения":"Copy details")}</button></details>
 <div className="runtime-inline">{detail.retryable&&detail.retry_available&&<button className="primary-button" disabled={working} onClick={()=>{setWorking(true);void retry().catch(()=>{}).finally(()=>setWorking(false));}}><RotateCcw size={15}/>{russian?"Повторить":"Retry"}</button>}
 {stop&&detail.instance_id&&<><button className="primary-button" disabled={working} onClick={()=>{setWorking(true);void run("stop_instance",{id:detail.instance_id,force:false}).then(clear).catch(()=>{}).finally(()=>setWorking(false));}}>{russian?"Подождать":"Wait"}</button><button className="quiet-button destructive" onClick={()=>setForce(true)}>{russian?"Принудительная остановка":"Force stop"}</button></>}
 <button className="quiet-button" onClick={clear}>{russian?"Закрыть":"Close"}</button></div>
 {force&&<RuntimeDialog title={russian?"Остановить Minecraft принудительно?":"Force stop Minecraft?"} closeLabel={russian?"Отмена":"Cancel"} onClose={()=>setForce(false)}><p>{russian?"Несохранённые изменения мира могут быть потеряны.":"Unsaved world changes may be lost."}</p><button className="primary-button" onClick={()=>void run("stop_instance",{id:detail.instance_id,force:true}).then(clear).catch(()=>{})}>{russian?"Остановить":"Stop"}</button></RuntimeDialog>}
 </RuntimeDialog>;
}
