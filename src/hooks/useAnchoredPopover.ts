import { useLayoutEffect, useRef } from "react";

/** Keep nonmodal menus in the top layer while retaining their DOM ancestry. */
export function useAnchoredPopover() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const anchor = element?.parentElement?.querySelector("button");
    if (!element || !anchor) return;
    element.showPopover();
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(320, innerWidth - 24);
      const below = innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const upwards = below < 200 && above > below;
      const height = Math.max(40, Math.min(innerHeight - 24, upwards ? above : below));
      element.style.width = `${width}px`;
      element.style.maxHeight = `${height}px`;
      element.style.left = `${Math.max(12, Math.min(rect.right - width, innerWidth - width - 12))}px`;
      const actualHeight = element.getBoundingClientRect().height;
      element.style.top = `${Math.max(12, Math.min(upwards ? rect.top - actualHeight - 8 : rect.bottom + 8, innerHeight - actualHeight - 12))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      element.hidePopover();
    };
  }, []);
  return ref;
}
