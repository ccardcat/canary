import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import RemoteImage from "./RemoteImage";
import { externalLink,safeExternalUrl,safeRemoteImageUrl } from "../services/links";
function safeHtml(body:string):string {
 const fragment=DOMPurify.sanitize(body,{RETURN_DOM_FRAGMENT:true,USE_PROFILES:{html:true},FORBID_TAGS:["form","input","button","iframe","video","audio","style"],FORBID_ATTR:["style","srcset"]});
 for(const link of fragment.querySelectorAll("a")){const safe=safeExternalUrl(link.getAttribute("href")||"");if(safe)link.setAttribute("href",safe);else link.removeAttribute("href");link.setAttribute("rel","noopener noreferrer");}
 for(const image of fragment.querySelectorAll("img")){const safe=safeRemoteImageUrl(image.getAttribute("src")||"");if(safe)image.setAttribute("src",safe);else image.removeAttribute("src");image.setAttribute("referrerpolicy","no-referrer");}
 const holder=document.createElement("div");holder.append(fragment);return holder.innerHTML;
}
export default function Markdown({ body,format="markdown" }: { body: string;format?:"html"|"markdown" }) {
  if(format==="html")return <div className="markdown selectable" onClick={e=>{const link=(e.target as Element).closest("a");if(link){e.preventDefault();externalLink(link.href);}}} dangerouslySetInnerHTML={{__html:safeHtml(body)}}/>;
  return (
    <div className="markdown selectable">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href?safeExternalUrl(href):undefined}
              onClick={(e) => {
                e.preventDefault();
                if (href) externalLink(href);
              }}
            >
              {children}
              <ExternalLink size={11} />
            </a>
          ),
          img: ({ src, alt }) => (
            <RemoteImage
              src={typeof src === "string" ? safeRemoteImageUrl(src) : undefined}
              alt={alt || ""}
              className="markdown-image"
            />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
