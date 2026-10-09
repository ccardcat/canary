// A second guard for copied diagnostics; the backend sanitizes before persistence.
export function redactDiagnostic(text:string):string {
 return text
  .replace(/(\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/gim,"$1<redacted>")
  .replace(/(\b(?:bearer|basic)\s+)[a-z0-9._~+/=-]+/gi,"$1<redacted>")
  .replace(/(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|identity[_-]?token|rps[_-]?ticket|user[_-]?tokens|client[_-]?(?:token|secret)|session(?:[_-]?(?:id|secret|token))?|authorization(?:[_-]?code)?|proxy-authorization|auth[_-]?code|cookies?|set-cookie|api[_-]?key|x-api-key|password|passwd|code_verifier)\b["']?\s*(?:[:=]\s*|\s+))(?:(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|\[[^\]]*\]|[^\s,;&}\]]+)/gi,"$1<redacted>")
  .replace(/(\b(?:token|secret|credentials?)\b["']?\s*[:=]\s*)(?:(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|\[[^\]]*\]|[^\s,;&}\]]+)/gi,"$1<redacted>")
  .replace(/([?&](?:code|state|ticket|token|api-key|api_key|key|sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token|access_token|refresh_token|password)=)[^&#\s]+/gi,"$1<redacted>")
  .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,"<redacted JWT>")
  .replace(/\b[A-Z]:[\\/]Users[\\/][^\\/\r\n"<>]+/gi,"<home>")
  .replace(/\/(?:home|Users)\/[^/\r\n"<>]+/g,"<home>");
}
export function sanitizeDetails(value:unknown,depth=0,seen=new WeakSet<object>()):unknown {
 if(typeof value==="string")return redactDiagnostic(value).slice(0,64*1024);
 if(!value||typeof value!=="object")return value;
 if(depth>8||seen.has(value))return "<details omitted>";seen.add(value);
 if(Array.isArray(value))return value.slice(0,200).map(v=>sanitizeDetails(v,depth+1,seen));
 return Object.fromEntries(Object.entries(value).slice(0,200).map(([key,item])=>[key,/^(?:token|secret|credentials?|access[_-]?token|refresh[_-]?token|id[_-]?token|identity[_-]?token|rps[_-]?ticket|user[_-]?tokens|client[_-]?(?:token|secret)|session(?:[_-]?(?:id|secret|token))?|authorization(?:[_-]?code)?|proxy-authorization|auth[_-]?code|cookies?|set-cookie|api[_-]?key|x-api-key|password|passwd|code_verifier)$/i.test(key)?"<redacted>":sanitizeDetails(item,depth+1,seen)]));
}
