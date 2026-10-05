import {useEffect,useRef} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow,type PhysicalPosition,type PhysicalSize} from "@tauri-apps/api/window";
type Previous={maximized:boolean;position:PhysicalPosition;size:PhysicalSize};
export function useWindowFullscreen(onError:()=>void){
 const error=useRef(onError);error.current=onError;
 useEffect(()=>{
  if(!isTauri())return;
  const win=getCurrentWindow();let previous:Previous|null=null;let mounted=true;let busy=false;let dispose:(()=>void)|undefined;
  const root=document.documentElement;
  const sync=async()=>{const fullscreen=await win.isFullscreen();const maximized=await win.isMaximized();if(mounted){root.dataset.windowFullscreen=String(fullscreen);root.dataset.windowState=fullscreen?"fullscreen":maximized?"maximized":"normal";}};
  const acknowledged=async(value:boolean)=>{await win.setFullscreen(value);for(let n=0;n<60;n++){if(await win.isFullscreen()===value)return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error("Fullscreen transition was not acknowledged");};
  const transition=async(exitOnly=false)=>{
   if(busy||!mounted)return;busy=true;root.dataset.windowTransition="true";
   try{
    const fullscreen=await win.isFullscreen();
    if(exitOnly&&!fullscreen)return;
    if(!fullscreen){previous={maximized:await win.isMaximized(),position:await win.outerPosition(),size:await win.innerSize()};await acknowledged(true);}
    else{await acknowledged(false);if(previous){if(previous.maximized)await win.maximize();else{await win.unmaximize();await win.setSize(previous.size);await win.setPosition(previous.position);}}previous=null;}
    await sync();
   }catch{await sync().catch(()=>{});error.current();}
   finally{busy=false;if(mounted)root.dataset.windowTransition="false";}
  };
  const key=(event:KeyboardEvent)=>{
   if(event.key==="F11"){event.preventDefault();if(!event.repeat&&!busy)void transition();}
   else if(event.key==="Escape"&&!event.defaultPrevented&&!event.repeat&&!document.querySelector('dialog[open],[role="dialog"],.instance-surface,.popover,.detail-page,.runtime-error,[role="menu"]')){void transition(true);}
  };
  document.addEventListener("keydown",key);void sync().catch(()=>{});
  void win.onResized(()=>{if(!busy)void sync().catch(()=>{});}).then(fn=>{if(mounted)dispose=fn;else fn();}).catch(()=>{});
  return()=>{mounted=false;dispose?.();document.removeEventListener("keydown",key);root.dataset.windowTransition="false";};
 },[]);
}
