import { useEffect, useRef, useState } from "react";
import { polishMessages } from "../locales/polish";

export default function DesktopBehavior() {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; input?: HTMLInputElement | HTMLTextAreaElement; selectable?: Element; selection: string; russian: boolean } | null>(null);
  const [clipboardError, setClipboardError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); setTooltip(null); };
    const show = (event: Event) => {
      const element = (event.target as Element).closest<HTMLElement>("[data-tooltip],button[aria-label]");
      if (!element || (!element.dataset.tooltip && element.textContent?.trim())) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const sidebar = !!element.closest(".sidebar.compact");
        const right = document.documentElement.dataset.sidebarSide === "right";
        setTooltip({ text: element.dataset.tooltip || element.getAttribute("aria-label") || "", x: Math.max(10, Math.min(innerWidth - 240, sidebar ? (right ? rect.left - 160 : rect.right + 10) : rect.left)), y: Math.min(innerHeight - 48, sidebar ? rect.top : rect.bottom + 8) });
      }, 180);
    };
    const context = (event: MouseEvent) => {
      event.preventDefault(); hide(); setClipboardError(false);
      const target = event.target as HTMLElement;
      const input = target.closest<HTMLInputElement | HTMLTextAreaElement>("input:not([type=range]):not([type=password]),textarea");
      const selectable = target.closest("pre,code,.selectable,.toast-details,.markdown,.detail-body,[data-copyable]");
      if (!input && !selectable) { setMenu(null); return; }
      const selection = input ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) : getSelection()?.toString() || "";
      setMenu({ x: Math.max(8, Math.min(innerWidth - 220, event.clientX)), y: Math.max(42, Math.min(innerHeight - 150, event.clientY)), input: input || undefined, selectable: selectable || undefined, selection, russian: document.documentElement.lang === "ru" });
    };
    const dismiss = (event: Event) => { if (!(event.target as Element).closest(".text-context-menu")) setMenu(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(null); hide(); } };
    document.addEventListener("pointerover", show); document.addEventListener("pointerout", hide);
    document.addEventListener("focusin", show); document.addEventListener("focusout", hide);
    document.addEventListener("contextmenu", context);
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    return () => { hide(); document.removeEventListener("pointerover", show); document.removeEventListener("pointerout", hide); document.removeEventListener("focusin", show); document.removeEventListener("focusout", hide); document.removeEventListener("contextmenu", context); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", key); window.removeEventListener("scroll", hide, true); };
  }, []);
  const text = polishMessages[menu?.russian ? "ru" : "en"];
  const action = async (kind: "copy" | "paste" | "selectAll") => {
    if (!menu) return;
    try {
      if (kind === "copy") await navigator.clipboard.writeText(menu.selection);
      if (kind === "paste" && menu.input) {
        const value = await navigator.clipboard.readText();
        menu.input.focus();
        if (!document.execCommand("insertText", false, value)) throw new Error("clipboard");
      }
      if (kind === "selectAll") {
        if (menu.input) { menu.input.focus(); menu.input.select(); }
        else if (menu.selectable) { const range = document.createRange(); range.selectNodeContents(menu.selectable); const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
      }
      setMenu(null);
    } catch { setClipboardError(true); }
  };
  return <>
    {tooltip && !menu && <div className="canary-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>}
    {menu && <div className="text-context-menu" role="menu" aria-label={text.copy} style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.preventDefault()}>
      <button role="menuitem" disabled={!menu.selection} onClick={() => void action("copy")}>{text.copy}</button>
      {menu.input && <button role="menuitem" disabled={menu.input.readOnly || menu.input.disabled} onClick={() => void action("paste")}>{text.paste}</button>}
      <button role="menuitem" onClick={() => void action("selectAll")}>{text.selectAll}</button>
      {clipboardError && <small role="status">{text.clipboard}</small>}
    </div>}
  </>;
}

// Pointer updates only two CSS properties on the hovered card, never React state.
export function cardSpotlight(event: React.PointerEvent<HTMLElement>) {
  const root = document.documentElement;
  if (event.pointerType === "touch" || root.dataset.motion === "reduced" || root.dataset.focus === "true" || root.dataset.quality === "low" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  card.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}
