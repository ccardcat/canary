import {useSyncExternalStore} from "react";
export interface LogSession {id:string;instanceId:string;file?:string;title:string;minecraft:string;startedAt:number;status:"playing"|"finished"|"crashed";crashReport?:string}
export interface LogLine {id:number;time:string;level:string;message:string;raw:string;search:string}
export const stripAnsi=(text:string)=>text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,"");
let serial=0;
// Bound retained text as well as row count. Long stack traces cannot grow the store indefinitely.
function bounded(lines:LogLine[]){let characters=0,start=lines.length;while(start>0&&lines.length-start<10000){const next=lines[start-1].raw.length;if(characters+next>1_000_000)break;characters+=next;start--;}return lines.slice(start);}
function overlap(saved:string[],live:LogLine[]){
 const pattern=live.map(l=>l.raw),prefix=Array(pattern.length).fill(0);if(!pattern.length)return 0;
 for(let i=1,j=0;i<pattern.length;i++){while(j&&pattern[i]!==pattern[j])j=prefix[j-1];if(pattern[i]===pattern[j])j++;prefix[i]=j;}
 let matched=0;for(const raw of saved){const line=stripAnsi(raw);while(matched&&(matched===pattern.length||line!==pattern[matched]))matched=prefix[matched-1];if(line===pattern[matched])matched++;}return matched;
}
export function parseLine(raw:string):LogLine{
 raw=stripAnsi(raw);const match=raw.match(/^\[?(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?\s*(?:\[.*?\/(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\]\s*:?)?\s*(.*)$/);
 const level=match?.[2]??raw.match(/\b(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\b/)?.[1]??"INFO";
 return {id:++serial,time:match?.[1]??"",level:level==="FATAL"?"ERROR":level,message:match?.[3]??raw,raw,search:raw.toLocaleLowerCase()};
}
class GameLogStore{
 value:{sessions:LogSession[];lines:Record<string,LogLine[]>;revision:number}={sessions:[],lines:{},revision:0};
 listeners=new Set<()=>void>();pending=new Map<string,string[]>();timer:ReturnType<typeof setTimeout>|undefined;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};get=()=>this.value;
 publish(){this.value={...this.value,revision:this.value.revision+1};this.listeners.forEach(fn=>fn());}
 sessions(sessions:LogSession[]){this.value={...this.value,sessions:[...sessions,...this.value.sessions.filter(s=>!sessions.some(n=>n.id===s.id))].slice(0,100)};this.publish();}
 push(payload:{id:string;session?:string;line:string},metadata?:{name:string;minecraft:string}){
  const key=payload.session?payload.id+":"+payload.session:payload.id+":live";
  if(!this.value.sessions.some(s=>s.id===key)){this.sessions([{id:key,instanceId:payload.id,file:payload.session,title:metadata?.name??"Minecraft",minecraft:metadata?.minecraft??"",startedAt:Date.now()/1000,status:"playing"}]);}
  const queue=this.pending.get(key)??[];queue.push(payload.line);if(queue.length>10000)queue.splice(0,queue.length-10000);this.pending.set(key,queue);
  if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;this.flush();},80);
 }
 pushBatch(payload:{id:string;session?:string;lines:string[]},metadata?:{name:string;minecraft:string}){for(const line of payload.lines)this.push({id:payload.id,session:payload.session,line},metadata);}
 flush(){if(!this.pending.size)return;const lines={...this.value.lines};for(const [key,queue]of this.pending){lines[key]=bounded([...(lines[key]??[]),...queue.map(parseLine)]);}this.pending.clear();const keep=new Set(this.value.sessions.slice(0,20).map(s=>s.id));for(const key of Object.keys(lines))if(!keep.has(key))delete lines[key];this.value={...this.value,lines};this.publish();}
 hydrate(key:string,text:string,initialRevision:number){if((this.value.lines[key]?.length??0)>initialRevision){const live=this.value.lines[key];const saved=text.split(/\r?\n/).filter(Boolean).slice(-10000);const shared=overlap(saved,live);this.value={...this.value,lines:{...this.value.lines,[key]:bounded([...saved.map(parseLine),...live.slice(shared)])}};this.publish();return;}this.value={...this.value,lines:{...this.value.lines,[key]:bounded(text.split(/\r?\n/).filter(Boolean).slice(-10000).map(parseLine))}};this.publish();}
 finish(id:string,status:string){this.value={...this.value,sessions:this.value.sessions.map(s=>s.instanceId===id&&s.status==="playing"?{...s,status:status==="crashed"?"crashed":"finished"}:s)};this.publish();}
 dispose(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.flush();}
}
export const gameLogStore=new GameLogStore();
export const useGameLogs=()=>useSyncExternalStore(gameLogStore.subscribe,gameLogStore.get);
