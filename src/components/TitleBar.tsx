import {useWindowFullscreen} from "./WindowFullscreen";
import {useEffect,useState} from "react";
import {Minus,Square,Copy,X} from "lucide-react";
import {isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {windowMessages} from "../locales/window";
import {useVisualAppearance} from "./VisualAppearance";
export default function TitleBar({light,russian}:{light:boolean;russian:boolean}){
 const {value}=useVisualAppearance();const [maximized,setMaximized]=useState(false);const [error,setError]=useState(false);
 useWindowFullscreen(()=>setError(true));const text=windowMessages[russian?"ru":"en"];
 useEffect(()=>{if(!isTauri())return;const win=getCurrentWindow();let dispose:(()=>void)|undefined;let live=true;const sync=()=>{void win.isMaximized().then(v=>{if(live)setMaximized(v);document.documentElement.dataset.windowMaximized=String(v);}).catch(()=>{});};sync();void win.onResized(sync).then(fn=>{if(live)dispose=fn;else fn();});return()=>{live=false;dispose?.();};},[]);
 const action=(kind:"minimize"|"toggleMaximize"|"close"|"startDragging")=>{if(isTauri()&&document.documentElement.dataset.windowTransition!=="true")void getCurrentWindow()[kind]().catch(()=>setError(true));};
 return <header className="window-titlebar" data-controls={value.windowControls} data-controls-position={value.controlsPosition}>
  <div className="window-drag" onMouseDown={e=>{if(e.button===0&&e.detail===1)action("startDragging");}} onDoubleClick={()=>action("toggleMaximize")} aria-hidden="true"/>
  <div className="window-brand" aria-hidden="true">{["icon","icon-text"].includes(value.titlebarBranding)&&<img src={`/branding/canary-bird-${light?"black":"white"}.png`} alt="" draggable={false}/>}{["text","icon-text"].includes(value.titlebarBranding)&&<span>Canary</span>}</div>
  {error&&<span className="window-status" role="status">{text.error}</span>}
  <div className="window-controls"><button className="window-minimize" data-tooltip={text.minimize} aria-label={text.minimize} onClick={()=>action("minimize")}><Minus size={16}/></button><button className="window-maximize" data-tooltip={maximized?text.restore:text.maximize} aria-label={maximized?text.restore:text.maximize} onClick={()=>action("toggleMaximize")}>{maximized?<Copy size={13}/>:<Square size={13}/>}</button><button className="window-close" data-tooltip={text.close} aria-label={text.close} onClick={()=>action("close")}><X size={17}/></button></div>
 </header>;
}
