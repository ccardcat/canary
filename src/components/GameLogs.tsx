import {useDeferredValue,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {Copy,FileText,FolderOpen,Search,ArrowDown} from "lucide-react";
import {useBackend} from "../services/backend";
import {gameLogStore,useGameLogs,type LogLine,type LogSession} from "../services/gameLogStore";
import GlassSelect from "./GlassSelect";
function Highlight({text,query}:{text:string;query:string}){const at=query?text.toLocaleLowerCase().indexOf(query):-1;if(at<0)return <>{text}</>;return <>{text.slice(0,at)}<mark>{text.slice(at,at+query.length)}</mark>{text.slice(at+query.length)}</>;}
function LogRow({line,query,wrap,measure}:{line:LogLine;query:string;wrap:boolean;measure:(id:number,height:number)=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const node=ref.current;if(!node||!wrap)return;const observer=new ResizeObserver(entries=>measure(line.id,Math.ceil(entries[0].borderBoxSize?.[0]?.blockSize??node.getBoundingClientRect().height)));observer.observe(node);return()=>observer.disconnect();},[wrap,line.id,measure]);
 return <div className={"game-log-line level-"+line.level.toLowerCase()} ref={ref} data-line-id={line.id}><time>{line.time}</time><span className="log-level">{line.level}</span><span className="log-message"><Highlight text={line.message} query={query}/></span></div>;
}
const empty:LogLine[]=[];
export function GameLogs({russian,initialInstanceId}:{russian:boolean;initialInstanceId?:string}){
 const {run,snapshot}=useBackend();const data=useGameLogs();const [selected,setSelected]=useState("");const [query,setQuery]=useState("");const search=useDeferredValue(query.toLocaleLowerCase());const [level,setLevel]=useState("all");const [auto,setAuto]=useState(true);const [wrap,setWrap]=useState(false);const [scroll,setScroll]=useState(0);const [viewport,setViewport]=useState({height:380,width:800});const [unseen,setUnseen]=useState(false);const [copied,setCopied]=useState(false);const [loading,setLoading]=useState(false);const [jumpTarget,setJumpTarget]=useState<number|null>(null);
 const view=useRef<HTMLDivElement>(null);const following=useRef(true);const sizes=useRef(new Map<number,number>());const [measureRevision,setMeasureRevision]=useState(0);const measureFrame=useRef(0);const loadingSequence=useRef(0);
 const measure=useMemo(()=>(id:number,height:number)=>{if(sizes.current.get(id)===height)return;sizes.current.set(id,height);if(!measureFrame.current)measureFrame.current=requestAnimationFrame(()=>{measureFrame.current=0;setMeasureRevision(n=>n+1);});},[]);
 useEffect(()=>()=>{loadingSequence.current++;cancelAnimationFrame(measureFrame.current);},[]);
 const sessions=data.sessions.filter(s=>!initialInstanceId||s.instanceId===initialInstanceId);
 const session=sessions.find(s=>s.id===selected)??sessions[0];
 const lines=data.lines[session?.id??""]??empty;
 const filtered=useMemo(()=>lines.filter(l=>(level==="all"||l.level===level)&&(!search||l.search.includes(search))),[lines,level,search]);
 useEffect(()=>{let live=true;void run<LogSession[]>("game_log_sessions").then(value=>{if(live&&Array.isArray(value))gameLogStore.sessions(value);}).catch(()=>{});return()=>{live=false;};},[run,snapshot?.instances]);
 useEffect(()=>{
  const seq=++loadingSequence.current;sizes.current.clear();setScroll(0);following.current=true;setUnseen(false);
  if(!session?.file||gameLogStore.value.lines[session.id]?.length){setLoading(false);return;}
  setLoading(true);const revision=gameLogStore.value.lines[session.id]?.length??0;
  void run<string>("read_game_log",{id:session.instanceId,session:session.file}).then(text=>{if(seq===loadingSequence.current)gameLogStore.hydrate(session.id,text??"",revision);}).catch(()=>{}).finally(()=>{if(seq===loadingSequence.current)setLoading(false);});
 },[session?.id,run]);
 useEffect(()=>{const el=view.current;if(!el)return;const observer=new ResizeObserver(()=>{setViewport({height:el.clientHeight,width:el.clientWidth});sizes.current.clear();setMeasureRevision(n=>n+1);});observer.observe(el);return()=>observer.disconnect();},[]);
 const offsets=useMemo(()=>{const values=[0];const chars=Math.max(20,Math.floor((viewport.width-140)/7.3));for(const line of filtered){const height=wrap?(sizes.current.get(line.id)??Math.max(28,20*Math.ceil(line.message.length/chars)+8)):28;values.push(values[values.length-1]+height);}return values;},[filtered,wrap,viewport.width,measureRevision]);
 const total=offsets[offsets.length-1];
 const lower=(position:number)=>{let a=0,b=filtered.length;while(a<b){const mid=(a+b)>>1;if(offsets[mid]<position)a=mid+1;else b=mid;}return a;};
 const start=Math.max(0,lower(scroll)-8),end=Math.min(filtered.length,lower(scroll+viewport.height)+8);
 const latest=lines[lines.length-1]?.id;
 useLayoutEffect(()=>{if(!view.current)return;if(auto&&following.current){view.current.scrollTop=total;setScroll(view.current.scrollTop);setUnseen(false);}else if(latest)setUnseen(true);},[latest,total,auto]);
 useLayoutEffect(()=>{if(jumpTarget===null||level!=="all"||search||!view.current)return;const index=filtered.findIndex(line=>line.id===jumpTarget);if(index<0){setJumpTarget(null);return;}view.current.scrollTop=offsets[index];setScroll(view.current.scrollTop);setUnseen(false);setJumpTarget(null);},[jumpTarget,level,search,filtered,offsets]);
 useEffect(()=>setCopied(false),[session?.id,query,level]);
 const bottom=()=>{following.current=true;setUnseen(false);if(view.current){view.current.scrollTop=total;setScroll(view.current.scrollTop);}};
 const label=(ru:string,en:string)=>russian?ru:en;
 return <section className="game-logs"><h2>{label("Логи игры","Game Logs")}</h2>
 {sessions.length>0&&<GlassSelect aria-label={label("Сессия игры","Game session")} value={session?.id??""} onChange={e=>{setSelected(e.target.value);setQuery("");setLevel("all");}}>{sessions.map(s=><option key={s.id} value={s.id}>{s.title} · Minecraft {s.minecraft} · {new Date(s.startedAt*1000).toLocaleString(russian?"ru":"en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</option>)}</GlassSelect>}
 {session&&<p className="settings-note">{session.status==="playing"?label("Игра запущена","Game running"):session.status==="crashed"?label("Ошибка","Crashed"):label("Завершено","Finished")}</p>}
 {session?.status==="crashed"&&<div className="game-crash-summary"><b>{label("Minecraft завершился с ошибкой","Minecraft exited with an error")}</b><div className="runtime-inline"><button className="quiet-button" onClick={()=>{const error=lines.find(l=>l.level==="ERROR");if(!error)return;following.current=false;setLevel("all");setQuery("");setJumpTarget(error.id);}}>{label("Перейти к первой ошибке","Jump to first error")}</button>{session.crashReport&&<button className="quiet-button" onClick={()=>void run("open_game_log",{id:session.instanceId,session:session.crashReport,crash:true}).catch(()=>{})}>{label("Открыть crash report","Open crash report")}</button>}</div></div>}
 <div className="game-log-toolbar"><label className="log-search"><Search size={15}/><input aria-label={label("Поиск по логам","Search logs")} placeholder={label("Поиск по логам","Search logs")} value={query} onChange={e=>setQuery(e.target.value)}/></label><GlassSelect aria-label={label("Уровень сообщений","Log level")} value={level} onChange={e=>setLevel(e.target.value)}>{[["all","Все","All"],["ERROR","Ошибки","Errors"],["WARN","Предупреждения","Warnings"],["INFO","Info","Info"],["DEBUG","Debug","Debug"],["TRACE","Trace","Trace"]].map(([key,ru,en])=><option key={key} value={key}>{russian?ru:en}</option>)}</GlassSelect></div>
 <div className="game-log-actions"><label><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);if(e.target.checked)bottom();}}/>{label("Автопрокрутка","Auto-scroll")}</label><label><input type="checkbox" checked={wrap} onChange={e=>{sizes.current.clear();setWrap(e.target.checked);}}/>{label("Перенос строк","Wrap lines")}</label><button className="quiet-button" disabled={!filtered.length} onClick={()=>void navigator.clipboard.writeText(filtered.map(l=>l.raw).join("\n")).then(()=>setCopied(true)).catch(()=>setCopied(false))}><Copy size={14}/>{copied?label("Скопировано","Copied"):label("Копировать","Copy")}</button>
 {session?.file&&<button className="quiet-button" onClick={()=>void run("open_game_log",{id:session.instanceId,session:session.file}).catch(()=>{})}><FileText size={14}/>{label("Открыть файл","Open file")}</button>}{session&&<button className="quiet-button" onClick={()=>void run("open_instance_folder",{id:session.instanceId,folder:"logs"}).catch(()=>{})}><FolderOpen size={14}/>{label("Открыть папку логов","Open logs folder")}</button>}</div>
 <div className={"game-log-viewport selectable "+(wrap?"wrap":"")} role="log" aria-label={label("Содержимое логов игры","Game log output")} aria-live="off" tabIndex={0} ref={view} onScroll={e=>{const el=e.currentTarget;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;setScroll(el.scrollTop);if(following.current)setUnseen(false);}}>
 {!filtered.length?<p className="game-log-empty">{loading?label("Читаем логи…","Reading logs…"):label("Сообщений пока нет","No messages yet")}</p>:<div className="game-log-spacer" style={{height:total}}><div className="game-log-window" style={{transform:"translateY("+offsets[start]+"px)"}}>{filtered.slice(start,end).map(line=><LogRow key={line.id} line={line} query={search} wrap={wrap} measure={measure}/>)}</div></div>}</div>
 {unseen&&<button className="quiet-button log-new-messages" onClick={bottom}>{label("Новые сообщения","New messages")} <ArrowDown size={14}/></button>}
 <p className="settings-note">{filtered.length.toLocaleString(russian?"ru":"en")} / {lines.length.toLocaleString(russian?"ru":"en")} {label("строк · до 10 000 строк / 1 MB текста","lines · up to 10,000 lines / 1 MB of text")}</p></section>;
}

