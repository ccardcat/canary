import {SmoothRange} from "./SmoothRange";
import GlassSelect from "./GlassSelect";
export function memoryMaximum(total?:number){return total?Math.max(1,Math.floor((total-512)/1024)):null;}
export function memoryRecommendation(total?:number,modded=true){return Math.max(1,Math.min(modded?8:4,Math.floor((total??8192)/2048),memoryMaximum(total)??8));}
export function MemorySettings({russian,total,mode="manual",value,onChange,modded=true,jvmArgs=[]}:{russian:boolean;total?:number;mode?:"auto"|"manual";value:number;onChange:(mode:"auto"|"manual",value:number)=>void;modded?:boolean;jvmArgs?:string[]}){
 const max=memoryMaximum(total),recommended=memoryRecommendation(total,modded);
 const selected=mode==="auto"?recommended:Math.max(1,Math.min(max??value/1024,Math.round(value/1024)));
 const label=russian?"Максимальная оперативная память":"Maximum memory";
 return <section className="memory-settings"><h4>{label}</h4><label>{russian?"Режим памяти":"Memory mode"}<GlassSelect aria-label={russian?"Режим памяти":"Memory mode"} value={mode} onChange={e=>onChange(e.target.value as "auto"|"manual",selected*1024)}><option value="auto">{russian?"Автоматически":"Automatic"}</option><option value="manual">{russian?"Вручную":"Manual"}</option></GlassSelect></label>
 <SmoothRange label={label} value={selected} min={1} max={max??Math.max(8,selected)} step={1} unit=" GB" disabled={mode==="auto"||!max} onCommit={n=>onChange("manual",n*1024)}/>
 <p className="settings-note">{russian?"Выделено":"Allocated"}: {selected} GB · {russian?"Оперативная память системы":"System memory"}: {total?(total/1024).toFixed(1)+" GB":"—"}</p>
 <p className="settings-note">{russian?"Рекомендуется":"Recommended"}: {recommended} GB · {russian?"Большой объём памяти может увеличить паузы сборщика мусора.":"Larger heaps can increase garbage collection pauses."}</p>
 {!total&&<p role="status" className="settings-note">{russian?"Не удалось определить физическую RAM. Повторите проверку перед ручной настройкой.":"Physical RAM could not be detected. Refresh before selecting a manual allocation."}</p>}
 {max&&value>max*1024&&mode==="manual"&&<p role="status" className="memory-warning">{russian?"Сохранённое значение превышает память этой системы. Для запуска оно будет уменьшено.":"The saved allocation exceeds this system's memory. It will be reduced at launch."}</p>}
 {total&&selected*1024>=total*.8&&<p role="status" className="memory-warning">{russian?"Вы выделяете почти всю оперативную память системы. Это может замедлить систему и Minecraft.":"You are allocating almost all system memory. This can slow down your system and Minecraft."}</p>}
 {jvmArgs.some(a=>/^-Xm[xs]|^-XX:(MaxHeapSize|InitialHeapSize|MaxRAMPercentage|InitialRAMPercentage)=/.test(a))&&<p className="settings-note">{russian?"Canary управляет памятью: пользовательские параметры heap будут проигнорированы.":"Canary manages memory: custom heap arguments will be ignored."}</p>}</section>;
}
