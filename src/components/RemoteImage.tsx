import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import {safeImageUrl} from "../services/links";
type Props = { src?: string; alt?: string; className?: string; onUnavailable?: () => void };
export default function RemoteImage(props: Props) {
  return <ImageLoader key={props.src} {...props} src={safeImageUrl(props.src)} />;
}
function ImageLoader({ src, alt = "", className = "", onUnavailable }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);
  const [assetBlob, setAssetBlob] = useState<string>();
  const assetAttempt = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const blob = useRef<string | undefined>(undefined);
  const callback = useRef(onUnavailable); callback.current = onUnavailable;
  useEffect(() => {if (failed) callback.current?.();}, [failed]);
  useEffect(() => () => {
    controller.current?.abort(); controller.current = null; assetAttempt.current = false;
    if (blob.current) URL.revokeObjectURL(blob.current);
  }, []);
  const fail = async () => {
    if (controller.current && !controller.current.signal.aborted && !blob.current) return;
    if (src && /^(asset:\/\/localhost\/|https?:\/\/asset\.localhost\/)/i.test(src) && !assetAttempt.current) {
      assetAttempt.current = true;
      const abort = new AbortController(); controller.current = abort;
      try {
        const response = await fetch(src, {signal: abort.signal});
        if (!response.ok) throw Error("Cannot load local image");
        const data = await response.blob();
        if (abort.signal.aborted) return;
        blob.current = URL.createObjectURL(data); setAssetBlob(blob.current); return;
      } catch {if (abort.signal.aborted) return; controller.current = null;}
    }
    setFailed(true);
  };
  useEffect(() => {
    if (image.current?.complete) {
      setLoaded(image.current.naturalWidth > 0);
      if (image.current.naturalWidth === 0) void fail();
    }
  }, []);
  return (
    <span
      className={`remote-image ${className} ${loaded || failed ? "ready" : ""}`}
    >
      {src && !failed ? (
        <img
          ref={image}
          src={assetBlob || src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => void fail()}
        />
      ) : (
        <Package size={24} aria-label={alt} />
      )}
    </span>
  );
}
