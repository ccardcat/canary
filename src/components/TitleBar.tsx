import {useWindowFullscreen} from "./WindowFullscreen";
import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { windowMessages } from "../locales/window";
export default function TitleBar({ light, russian }: { light: boolean; russian: boolean }) {
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState(false);
  useWindowFullscreen(()=>setError(true));
  const text = windowMessages[russian ? "ru" : "en"];
  useEffect(() => { if (!isTauri()) return; const win = getCurrentWindow(); let dispose: (() => void) | undefined; let cancelled = false; const sync = () => { void win.isMaximized().then(setMaximized).catch(() => {}); }; sync(); void win.onResized(sync).then(fn => { if (cancelled) fn(); else dispose = fn; }); return () => { cancelled = true; dispose?.(); }; }, []);
  const action = (kind: "minimize" | "toggleMaximize" | "close" | "startDragging") => { if (isTauri()) void getCurrentWindow()[kind]().catch(() => setError(true)); };
  return <header className="window-titlebar">
    <div className="window-drag" onMouseDown={e => { if (e.button === 0 && e.detail === 1) action("startDragging"); }} onDoubleClick={() => action("toggleMaximize")}><img src={`/branding/canary-bird-${light ? "black" : "white"}.png`} alt="" draggable={false} /><span>Canary</span>{error && <span role="status">{text.error}</span>}</div>
    <div className="window-controls"><button data-tooltip={text.minimize} aria-label={text.minimize} onClick={() => action("minimize")}><Minus size={16} /></button><button data-tooltip={maximized ? text.restore : text.maximize} aria-label={maximized ? text.restore : text.maximize} onClick={() => action("toggleMaximize")}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button><button className="window-close" data-tooltip={text.close} aria-label={text.close} onClick={() => action("close")}><X size={17} /></button></div>
  </header>;
}
