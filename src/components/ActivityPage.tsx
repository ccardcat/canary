import {memo,useMemo,useState} from "react";
import {Play,Square,UserRound,Trash2,RefreshCw,ArrowDownToLine,CircleAlert,Wrench,Coffee} from "lucide-react";
import {useBackend,type Snapshot} from "../services/backend";
import {ActivityTasks} from "./TaskActivity";
import {GameLogs} from "./GameLogs";
import {RuntimeDialog} from "./RuntimeDialog";
import "./Stabilization.css";
const labels:Record<string,[string,string]>={
 instance_copied:["Создана копия экземпляра","Instance copied"],pack_exported:["Сборка экспортирована","Modpack exported"],worlds_backed_up:["Копия миров сохранена","World backup saved"],instance_imported:["Экземпляр перенесён","Instance imported"],
 instance_installed:["Экземпляр установлен","Instance installed"],instance_created:["Экземпляр создан","Instance created"],instance_removed:["Экземпляр удалён","Instance removed"],
 game_launched:["Игра запущена","Game launched"],game_exited:["Игра завершена","Game exited"],game_crashed:["Minecraft завершился с ошибкой","Minecraft crashed"],crashed:["Minecraft завершился с ошибкой","Minecraft crashed"],
 account_added:["Аккаунт добавлен","Account added"],account_removed:["Аккаунт удалён","Account removed"],java_installed:["Java установлена","Java installed"],
 content_install:["Контент установлен","Content installed"],content_update:["Контент обновлён","Content updated"],content_updated:["Контент обновлён","Content updated"],content_remove:["Контент удалён","Content removed"],content_disable:["Контент выключен","Content disabled"],content_enable:["Контент включён","Content enabled"],content_rollback:["Контент восстановлен","Content restored"],content_import:["Контент импортирован","Content imported"],content_bulk_install:["Контент установлен","Content installed"],
 repair_completed:["Восстановление завершено","Repair completed"],install_cancelled:["Установка отменена","Installation cancelled"],operation_failed:["Операция завершилась с ошибкой","Operation failed"],download_completed:["Загрузка завершена","Download completed"]
};
type Item=Snapshot["activity"][number];
function category(item:Item){return /failed|crashed/.test(item.kind)?"errors":item.kind.startsWith("game_")?"game":item.kind.startsWith("content_")?"content":/install|repair|download|java/.test(item.kind)?"installs":"all";}
const RecentActivity=memo(function RecentActivity({items,russian,onClear}:{items:Item[];russian:boolean;onClear:()=>void}){
 const [filter,setFilter]=useState("all");
 const grouped=useMemo(()=>{
  const unique:{item:Item;count:number}[]=[];
  for(const item of [...items].sort((a,b)=>b.timestamp-a.timestamp)){if(!labels[item.kind]||item.kind==="ready")continue;
   const prior=unique.find(u=>u.item.kind===item.kind&&u.item.message===item.message&&u.item.instance===item.instance&&Math.abs(u.item.timestamp-item.timestamp)<300);
   if(prior&&/failed|crashed/.test(item.kind)){prior.count++;continue;}unique.push({item,count:1});
  }
  const groups=new Map<string,typeof unique>();
  for(const entry of unique){if(filter!=="all"&&category(entry.item)!==filter)continue;const date=new Date(entry.item.timestamp*1000);const key=date.toLocaleDateString();groups.set(key,[...(groups.get(key)??[]),entry]);}
  return [...groups.values()];
 },[items,filter]);
 const today=new Date().toLocaleDateString(),yesterday=new Date(Date.now()-86400000).toLocaleDateString();
 const dateTitle=(timestamp:number)=>{const d=new Date(timestamp*1000),key=d.toLocaleDateString();return key===today?(russian?"Сегодня":"Today"):key===yesterday?(russian?"Вчера":"Yesterday"):d.toLocaleDateString(russian?"ru":"en",{day:"numeric",month:"long"});};
 return <section className="recent-activity"><div className="runtime-heading"><h2>{russian?"Недавняя активность":"Recent activity"}</h2><button className="quiet-button" disabled={!items.length} onClick={onClear}>{russian?"Очистить историю":"Clear history"}</button></div>
 <div className="activity-filters" role="group" aria-label={russian?"Фильтр активности":"Activity filter"}>{[["all","Все","All"],["game","Игра","Game"],["installs","Установки","Installs"],["content","Контент","Content"],["errors","Ошибки","Errors"]].map(([key,ru,en])=><button className="quiet-button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{russian?ru:en}</button>)}</div>
 {!grouped.length&&<p className="settings-note">{russian?"Здесь появятся события Canary.":"Canary events will appear here."}</p>}
 {grouped.map(group=><div className="activity-date-group" key={new Date(group[0].item.timestamp*1000).toLocaleDateString()}><h4>{dateTitle(group[0].item.timestamp)}</h4>{group.map(({item,count})=>{const Icon=/crash|failed/.test(item.kind)?CircleAlert:item.kind==="game_launched"?Play:item.kind==="game_exited"?Square:item.kind.startsWith("account")?UserRound:/removed|remove/.test(item.kind)?Trash2:/updated|update/.test(item.kind)?RefreshCw:/repair/.test(item.kind)?Wrench:/java/.test(item.kind)?Coffee:ArrowDownToLine;return <div className={"recent-event "+category(item)} key={item.id}><Icon size={16}/><div><b>{labels[item.kind][russian?0:1]}{count>1?" ×"+count:""}</b>{item.message&&<small>{item.message}</small>}</div><time dateTime={new Date(item.timestamp*1000).toISOString()}>{new Date(item.timestamp*1000).toLocaleTimeString(russian?"ru":"en",{hour:"2-digit",minute:"2-digit",hour12:false})}</time></div>;})}</div>)}</section>;
});
const empty:Item[]=[];
export function ActivityPage({russian}:{russian:boolean}){
 const {snapshot,run}=useBackend();const [tab,setTab]=useState("activity");const [confirm,setConfirm]=useState(false);
 return <section className="activity-page"><div className="font-options"><button aria-pressed={tab==="activity"} onClick={()=>setTab("activity")}>{russian?"Активность":"Activity"}</button><button aria-pressed={tab==="logs"} onClick={()=>setTab("logs")}>{russian?"Логи игры":"Game Logs"}</button></div>
 {tab==="activity"?<><ActivityTasks russian={russian} showRecent={false}/><RecentActivity items={snapshot?.activity??empty} russian={russian} onClear={()=>setConfirm(true)}/></>:<GameLogs russian={russian}/>}
 {confirm&&<RuntimeDialog title={russian?"Очистить историю активности?":"Clear activity history?"} closeLabel={russian?"Закрыть":"Close"} onClose={()=>setConfirm(false)}><p>{russian?"Логи игры и файлы экземпляров сохранятся.":"Game logs and instance files will be preserved."}</p><div className="runtime-inline"><button className="primary-button" onClick={()=>void run("clear_activity").then(()=>setConfirm(false)).catch(()=>{})}>{russian?"Очистить":"Clear"}</button><button className="quiet-button" onClick={()=>setConfirm(false)}>{russian?"Отмена":"Cancel"}</button></div></RuntimeDialog>}</section>;
}
