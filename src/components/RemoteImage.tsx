import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import {safeImageUrl} from "../services/links";
type Props = { src?: string; alt?: string; className?: string };
export default function RemoteImage(props: Props) {
  return <ImageLoader key={props.src} {...props} src={safeImageUrl(props.src)} />;
}
function ImageLoader({ src, alt = "", className = "" }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);
  useEffect(() => {
    if (image.current?.complete) {
      setLoaded(image.current.naturalWidth > 0);
      setFailed(image.current.naturalWidth === 0);
    }
  }, []);
  return (
    <span
      className={`remote-image ${className} ${loaded || failed ? "ready" : ""}`}
    >
      {src && !failed ? (
        <img
          ref={image}
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <Package size={24} aria-label={alt} />
      )}
    </span>
  );
}
