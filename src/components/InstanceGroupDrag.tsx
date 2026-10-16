import {useEffect,useState} from "react";

// Pointer dragging works alongside Tauri's native file-drop handler on Windows.
// HTML5 draggable cards cannot receive dragover there when native drops are on.
export function InstanceGroupDrag({move}:{move:(id:string,group:string|null)=>void}) {
 const [ghost,setGhost]=useState<{name:string;x:number;y:number}|null>(null);
 useEffect(()=>{
  let start:{id:string;name:string;x:number;y:number;pointer:number}|null=null,dragging=false,target:HTMLElement|null=null;
  const clear=()=>{target?.removeAttribute("data-drag-over");target=null;start=null;dragging=false;setGhost(null);document.documentElement.removeAttribute("data-instance-dragging");};
  const down=(event:PointerEvent)=>{if(event.button!==0||(event.target as Element).closest("button,a,input,select,textarea,summary"))return;const card=(event.target as Element).closest<HTMLElement>("[data-instance-id]");if(card){if(event.pointerType!=="touch")event.preventDefault();start={id:card.dataset.instanceId!,name:card.querySelector("h3")?.textContent??"",x:event.clientX,y:event.clientY,pointer:event.pointerId};}};
  const track=(event:PointerEvent)=>{if(!start||event.pointerId!==start.pointer)return;if(!dragging&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)return;dragging=true;event.preventDefault();document.documentElement.dataset.instanceDragging="true";setGhost({name:start.name,x:Math.min(innerWidth-160,event.clientX+12),y:Math.min(innerHeight-42,event.clientY+12)});const next=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-instance-group]")??null;if(next!==target){target?.removeAttribute("data-drag-over");target=next;target?.setAttribute("data-drag-over","true");}const lane=document.querySelector(".content-shell");if(lane){const bounds=lane.getBoundingClientRect();if(event.clientY<bounds.top+28)lane.scrollBy(0,-24);else if(event.clientY>bounds.bottom-28)lane.scrollBy(0,24);}};
  const up=(event:PointerEvent)=>{if(!start||event.pointerId!==start.pointer)return;if(dragging&&target)move(start.id,target.dataset.instanceGroup||null);clear();};
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape")clear();};
  document.addEventListener("pointerdown",down);document.addEventListener("pointermove",track,{passive:false});document.addEventListener("pointerup",up);document.addEventListener("pointercancel",clear);document.addEventListener("keydown",key);window.addEventListener("blur",clear);
  return()=>{clear();document.removeEventListener("pointerdown",down);document.removeEventListener("pointermove",track);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",clear);document.removeEventListener("keydown",key);window.removeEventListener("blur",clear);};
 },[move]);
 return ghost?<div className="collection-drag-ghost" aria-hidden="true" style={{left:ghost.x,top:ghost.y}}>{ghost.name}</div>:null;
}
