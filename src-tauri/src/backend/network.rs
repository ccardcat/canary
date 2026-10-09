//! Public-network policy is enforced before each hop and by the resolver used
//! for the actual connection. A second DNS lookup cannot rebind the destination.
use super::model::*;
use reqwest::{dns::{Addrs, Name, Resolve, Resolving}, redirect::Policy, Url};
use std::{net::{IpAddr, SocketAddr}, sync::Arc};

pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a,b,c,_] = ip.octets();
            !(ip.is_private() || ip.is_loopback() || ip.is_link_local()
                || ip.is_broadcast() || ip.is_multicast() || ip.is_unspecified()
                || a == 0 || a >= 240 || a == 127
                || (a == 100 && (64..=127).contains(&b))
                || (a == 192 && (b == 0 || b == 168))
                || (a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            if let Some(v4) = ip.to_ipv4_mapped() { return public_ip(IpAddr::V4(v4)); }
            let s = ip.segments();
            // Global unicast only. Reject translation/tunneling/documentation
            // ranges that can conceal a local IPv4 destination.
            (s[0] & 0xe000) == 0x2000 && !(s[0] == 0x2001 && s[1] < 0x200)
                && !(s[0] == 0x2001 && s[1] == 0xdb8) && s[0] != 0x2002
        }
    }
}

pub fn public_url(url: &Url) -> Result<()> {
    let host = url.host_str().unwrap_or("").trim_end_matches('.').to_ascii_lowercase();
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
        || url.port_or_known_default() != Some(443) || url.fragment().is_some()
        || host.is_empty() || host == "localhost" || !host.contains('.') && !host.contains(':')
        || [".localhost", ".local", ".internal", ".home", ".lan"].iter().any(|s| host.ends_with(s))
    { return Err(BackendError::new("unsafe_url", "Download address must use public HTTPS without embedded credentials")); }
    let literal = host.trim_matches(['[',']']).parse::<IpAddr>();
    if literal.is_ok_and(|ip| !public_ip(ip)) {
        return Err(BackendError::new("unsafe_url", "Local and internal network destinations are not allowed"));
    }
    Ok(())
}

pub fn request_url(url: &Url) -> Result<()> {
    // Only compiled unit tests may use the isolated HTTP fixtures. This is not
    // a runtime environment switch and is absent from production binaries.
    #[cfg(test)] if url.scheme() == "http" && url.host_str() == Some("127.0.0.1")
        && url.username().is_empty() && url.password().is_none() { return Ok(()); }
    public_url(url)
}

#[derive(Debug)] struct PublicResolver;
impl Resolve for PublicResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let addresses: Vec<SocketAddr> = tokio::net::lookup_host((name.as_str(), 0)).await?.collect();
            if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
                return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,
                    "DNS destination is outside the public network").into());
            }
            Ok(Box::new(addresses.into_iter()) as Addrs)
        })
    }
}

pub fn client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder().no_proxy().dns_resolver(Arc::new(PublicResolver))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 { attempt.error("Too many download redirects") }
            else if request_url(attempt.url()).is_err() { attempt.error("Unsafe download redirect") }
            else { attempt.follow() }
        }))
}

pub async fn bytes(mut response: reqwest::Response, maximum: usize) -> Result<Vec<u8>> {
    if response.content_length().is_some_and(|n| n > maximum as u64) {
        return Err(BackendError::new("metadata_limit", "Response exceeds the supported metadata size"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if chunk.len() > maximum.saturating_sub(bytes.len()) {
            return Err(BackendError::new("metadata_limit", "Response exceeds the supported metadata size"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub async fn json(response: reqwest::Response) -> Result<serde_json::Value> {
    Ok(serde_json::from_slice(&bytes(response, 16 * 1024 * 1024).await?)?)
}

#[cfg(test)] mod tests {
    use super::*;use std::net::{Ipv4Addr,Ipv6Addr};
    #[test] fn rejects_private_encoded_and_credential_destinations() {
        for url in ["http://cdn.modrinth.com/file", "https://localhost/file", "https://127.1/file",
            "https://2130706433/file", "https://0x7f000001/file", "https://10.0.0.1/",
            "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/", "https://[::1]/",
            "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/", "https://[fe80::1]/",
            "https://[2002:7f00:1::]/", "https://service.internal/", "https://user:secret@cdn.modrinth.com/file",
            "https://cdn.modrinth.com:8443/file", "https://localhost./"] {
            assert!(public_url(&Url::parse(url).unwrap()).is_err(), "{url}");
        }
        assert!(public_url(&Url::parse("https://cdn.modrinth.com/data/file.jar").unwrap()).is_ok());
        assert!(public_ip(IpAddr::V4(Ipv4Addr::new(1,1,1,1))));
        assert!(public_ip(IpAddr::V6("2606:4700::1111".parse::<Ipv6Addr>().unwrap())));
    }
    #[tokio::test] async fn resolver_refuses_private_dns_answers() {
        let resolver = PublicResolver;
        assert!(resolver.resolve("localhost".parse().unwrap()).await.is_err());
    }
}
