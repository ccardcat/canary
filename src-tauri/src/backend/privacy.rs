//! Sanitize at persistence/IPC sinks, before the UI can copy diagnostics.
use regex::Regex;
use std::sync::OnceLock;

pub fn redact(text:&str)->String{
    static RULES:OnceLock<Vec<Regex>>=OnceLock::new();
    let rules=RULES.get_or_init(||vec![
        Regex::new(r"(?im)(\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+").unwrap(),
        Regex::new(r"(?i)(\b(?:bearer|basic)\s+)[a-z0-9._~+/=-]+").unwrap(),
        Regex::new(r#"(?i)(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|identity[_-]?token|rps[_-]?ticket|user[_-]?tokens|client[_-]?token|client[_-]?secret|session(?:[_-]?(?:id|secret|token))?|authorization(?:[_-]?code)?|proxy-authorization|auth[_-]?code|cookies?|set-cookie|api[_-]?key|x-api-key|password|passwd|code_verifier)\b["']?\s*(?:[:=]\s*|\s+))(?:(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|\[[^\]]*\]|[^\s,;&}\]]+)"#).unwrap(),
        Regex::new(r#"(?i)(\b(?:token|secret|credentials?)\b["']?\s*[:=]\s*)(?:(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|\[[^\]]*\]|[^\s,;&}\]]+)"#).unwrap(),
        Regex::new(r"(?i)([?&](?:code|state|ticket|token|api-key|api_key|key|sig|signature|x-amz-signature|x-amz-credential|x-amz-security-token|access_token|refresh_token|password)=)[^&#\s]+").unwrap(),
    ]);
    let mut safe=text.to_owned();
    for rule in rules{safe=rule.replace_all(&safe,"${1}<redacted>").into_owned();}
    static JWT:OnceLock<Regex>=OnceLock::new();
    safe=JWT.get_or_init(||Regex::new(r"\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b").unwrap()).replace_all(&safe,"<redacted JWT>").into_owned();
    safe
}
pub fn diagnostic(text:&str)->String{
    let mut safe=redact(text);
    if let Some(home)=dirs::home_dir(){let home=home.to_string_lossy();if home.len()>3{safe=safe.replace(home.as_ref(),"<home>");safe=safe.replace(&home.replace('\\',"/"),"<home>");}}
    safe
}
pub fn game_line(text:&str,known:&[String])->String{
    let mut safe=text.to_owned();for secret in known{if secret.len()>8{safe=safe.replace(secret,"<redacted>");}}
    redact(&safe).chars().take(8192).collect()
}
pub fn child_environment(command:&mut std::process::Command){
    for (key,value) in std::env::vars_os(){let upper=key.to_string_lossy().to_ascii_uppercase();
        let embedded_password=reqwest::Url::parse(&value.to_string_lossy()).is_ok_and(|url|url.password().is_some());
        if embedded_password||["TOKEN","SECRET","PASSWORD","PASSWD","COOKIE","API_KEY","APIKEY","CREDENTIAL","AUTHORIZATION"].iter().any(|word|upper.contains(word))
            || matches!(upper.as_str(),"SSH_AUTH_SOCK"|"AWS_ACCESS_KEY_ID"|"CANARY_CURSEFORGE_PROXY_URL"|"CANARY_CURSEFORGE_DIRECT_API"|"JAVA_TOOL_OPTIONS"|"_JAVA_OPTIONS"|"JDK_JAVA_OPTIONS"|"CLASSPATH"){
            command.env_remove(key);
        }
    }
}
/// A child cannot force an arbitrarily large allocation by omitting newlines.
/// Excess bytes in one line are discarded until its newline, then reading resumes.
pub async fn lines<R:tokio::io::AsyncRead+Unpin>(reader:R,sender:tokio::sync::mpsc::Sender<String>,known:Vec<String>){
    use tokio::io::AsyncReadExt;
    let mut reader=reader;let mut block=[0u8;4096];let mut line=Vec::new();let mut truncated=false;
    loop{let n=match reader.read(&mut block).await{Ok(n)=>n,Err(_)=>break};if n==0{break;}
        for &byte in &block[..n]{if byte==b'\n'{let mut text=String::from_utf8_lossy(&line).trim_end_matches('\r').to_owned();if truncated{text.push_str(" <line truncated>");}if sender.send(game_line(&text,&known)).await.is_err(){return;}line.clear();truncated=false;}
            else if line.len()<64*1024{line.push(byte);}else{truncated=true;}}
    }
    if !line.is_empty(){let mut text=String::from_utf8_lossy(&line).into_owned();if truncated{text.push_str(" <line truncated>");}let _=sender.send(game_line(&text,&known)).await;}
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn synthetic_secrets_are_removed_without_losing_error_codes(){
        for text in ["Authorization: bEaReR synthetic-bearer-value", "refresh_token=synthetic-refresh-value", "--accessToken synthetic-access-value", "X-API-Key: synthetic-publisher-value", "Cookie: session=synthetic-cookie-value; other=private", r#"{"password":"synthetic-password-value","code":"unsafe_path"}"#, "https://example.org/?code=synthetic-code-value&state=synthetic-state-value"]{
            let safe=redact(text);assert!(!safe.contains("synthetic-"),"{safe}");
        }
        assert!(redact(r#"{"code":"unsafe_path","stage":"download","message":"File size mismatch"}"#).contains("unsafe_path"));
        assert_eq!(redact("[ERROR] Could not load mod: missing dependency"),"[ERROR] Could not load mod: missing dependency");
    }
    #[tokio::test]async fn huge_lines_are_bounded_and_following_lines_survive(){
        use tokio::io::AsyncWriteExt;let (reader,mut writer)=tokio::io::duplex(4096);let (sender,mut receiver)=tokio::sync::mpsc::channel(4);
        let task=tokio::spawn(lines(reader,sender,vec!["known-synthetic-secret".into()]));
        let producer=tokio::spawn(async move{writer.write_all(&vec![b'x';1024*1024]).await.unwrap();writer.write_all(b"\nBearer synthetic-secret\nnormal diagnostic\n").await.unwrap();});
        let first=receiver.recv().await.unwrap();assert!(first.len()<=8192);assert!(!receiver.recv().await.unwrap().contains("synthetic-secret"));assert_eq!(receiver.recv().await.unwrap(),"normal diagnostic");producer.await.unwrap();task.await.unwrap();
    }
    #[test]fn opaque_tokens_arrays_proxy_credentials_and_escaped_passwords_are_removed(){
        for text in [r#"{"token":"synthetic-opaque-token","code":"network"}"#,
            r#"identityToken="XBL3.0 x=123;synthetic-xbox-token""#,
            r#"RpsTicket="d=synthetic-microsoft-token""#,
            r#"UserTokens=["synthetic-first-token","synthetic-second-token"]"#,
            "Proxy-Authorization: NTLM synthetic-proxy-token",
            r#"password="synthetic-start\"synthetic-end"; code=network"#]{
            assert!(!redact(text).contains("synthetic-"),"{}",redact(text));
        }
        for text in ["Token expired; sign in again","Secret storage is unavailable"]{assert_eq!(redact(text),text);}
    }
}
