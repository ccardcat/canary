import { useEffect, useRef, useState } from "react";

/** Decode before committing; leave the previous artwork visible during loading. */
export default function ArtworkFade({ source, className, duration=380 }: { source?: string; className: string; duration?:number }) {
  const [layers, setLayers] = useState<{ current?: string; previous?: string }>({ current: source });
  const current = useRef(source);
  useEffect(() => {
    if(current.current===source){setLayers(old=>old.previous?{current:source}:old);return;}
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const commit = () => {
      if (cancelled || current.current === source) return;
      const previous = current.current;
      current.current = source;
      const animate=!!source&&!matchMedia("(prefers-reduced-motion: reduce)").matches&&document.documentElement.dataset.motion!=="reduced"&&document.documentElement.dataset.quality!=="low";
      setLayers({ current: source, previous:animate?previous:undefined });
      if(animate&&previous)timer = setTimeout(() => { if (!cancelled) setLayers({ current: source }); }, duration);
    };
    if (source) {
      const image = new Image();
      image.onload = () => { void image.decode().catch(() => {}).then(commit); };
      image.src = source;
    } else commit();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source,duration]);
  if (!layers.current && !layers.previous) return null;
  return <div className={`${className} artwork-fade`} aria-hidden="true">
    {layers.previous && <div key={`old-${layers.previous}`} className="artwork-layer artwork-previous" style={{ backgroundImage: `url("${layers.previous}")` }} />}
    {layers.current && <div key={layers.current} className="artwork-layer artwork-current" style={{ backgroundImage: `url("${layers.current}")` }} />}
  </div>;
}
