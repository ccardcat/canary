import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import RemoteImage from "./RemoteImage";
import { externalLink } from "../services/links";
export default function Markdown({ body }: { body: string }) {
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
