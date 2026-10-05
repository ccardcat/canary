import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import RemoteImage from "./RemoteImage";
import { externalLink } from "../services/links";
export default function Markdown({ body,format="markdown" }: { body: string;format?:"html"|"markdown" }) {
  if(format==="html")return <div className="markdown selectable" onClick={e=>{const link=(e.target as Element).closest("a");if(link){e.preventDefault();externalLink(link.href);}}} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(body,{USE_PROFILES:{html:true},FORBID_TAGS:["form","input","button","iframe","video","audio","style"],FORBID_ATTR:["style","srcset"]})}}/>;
  return (
    <div className="markdown selectable">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
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
              src={typeof src === "string" ? src : undefined}
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
