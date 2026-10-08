//! Publisher metadata is the source of truth for Minecraft/loader compatibility.
use super::{Backend, model::*};
use serde_json::{json, Value};

pub fn valid_version(value: &str) -> bool {
    !value.is_empty() && value.len() <= 96
        && value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
}

pub fn installer_repository(mc: &str, loader: &str) -> Result<&'static str> {
    match loader {
        "forge" => Ok("https://maven.minecraftforge.net/net/minecraftforge/forge"),
        "neoforge" if mc == "1.20.1" => Ok("https://maven.neoforged.net/releases/net/neoforged/forge"),
        "neoforge" => Ok("https://maven.neoforged.net/releases/net/neoforged/neoforge"),
        _ => Err(BackendError::new("loader_unsupported", "Unknown mod loader")),
    }
}

fn neoforge_target(version: &str) -> Option<String> {
    let (release, snapshot) = version.split_once('+').map_or((version, None), |(v, s)| (v, Some(s)));
    let numbers = release.split('-').next()?.split('.').map(str::parse::<u32>).collect::<std::result::Result<Vec<_>, _>>().ok()?;
    if numbers.len() < 3 { return None; }
    if numbers[0] >= 26 {
        if numbers.len() != 4 { return None; }
        if let Some(snapshot) = snapshot {
            let number = snapshot.strip_prefix("snapshot-")?.parse::<u32>().ok()?;
            return Some(format!("{}.{}-snapshot-{number}", numbers[0], numbers[1]));
        }
        return Some(if numbers[2] == 0 { format!("{}.{}", numbers[0], numbers[1]) }
            else { format!("{}.{}.{}", numbers[0], numbers[1], numbers[2]) });
    }
    if numbers.len() != 3 || snapshot.is_some() { return None; }
    Some(if numbers[1] == 0 { format!("1.{}", numbers[0]) }
        else { format!("1.{}.{}", numbers[0], numbers[1]) })
}

fn installer_versions(xml: &str, mc: &str, loader: &str) -> Vec<String> {
    let regex = regex::Regex::new(r"<version>([^<]+)</version>").unwrap();
    let prefix = format!("{mc}-");
    regex.captures_iter(xml).map(|c| c[1].to_owned()).filter(|v| valid_version(v))
        .filter(|v| if loader == "forge" || mc == "1.20.1" { v.starts_with(&prefix) }
            else { neoforge_target(v).as_deref() == Some(mc) })
        .collect::<Vec<_>>().into_iter().rev().collect()
}

async fn metadata(backend: &Backend, url: &str, loader: &str) -> Result<String> {
    let response = backend.client.get(url).timeout(std::time::Duration::from_secs(20)).send().await?;
    if !response.status().is_success() {
        let mut error = BackendError::new("loader_catalog", format!("{loader} metadata server returned HTTP {}", response.status().as_u16()));
        error.retryable = true;
        return Err(error);
    }
    Ok(response.text().await?)
}

pub async fn versions(backend: &Backend, mc: &str, loader: &str) -> Result<Value> {
    if !valid_version(mc) { return Err(BackendError::new("loader_incompatible", "Invalid Minecraft version")); }
    let versions = match loader {
        "forge" | "neoforge" => {
            let url = format!("{}/maven-metadata.xml", installer_repository(mc, loader)?);
            installer_versions(&metadata(backend, &url, loader).await?, mc, loader)
        }
        "fabric" | "quilt" => {
            let host = if loader == "fabric" { "https://meta.fabricmc.net/v2" } else { "https://meta.quiltmc.org/v3" };
            let games: Value = serde_json::from_str(&metadata(backend, &format!("{host}/versions/game"), loader).await?)?;
            let games = games.as_array().ok_or_else(|| BackendError::new("loader_catalog", "Invalid supported Minecraft list"))?;
            if !games.iter().any(|v| v["version"] == mc) { return Ok(json!([])); }
            let mut url = reqwest::Url::parse(host).unwrap();
            url.path_segments_mut().unwrap().extend(["versions", "loader", mc]);
            let releases: Value = serde_json::from_str(&metadata(backend, url.as_str(), loader).await?)?;
            releases.as_array().ok_or_else(|| BackendError::new("loader_catalog", "Invalid loader release list"))?
                .iter().filter_map(|v| v["loader"]["version"].as_str()).filter(|v| valid_version(v)).map(str::to_owned).collect()
        }
        _ => return Err(BackendError::new("loader_unsupported", "Unknown mod loader")),
    };
    Ok(json!(versions.into_iter().map(|version| json!({"loader":{"version":version}})).collect::<Vec<_>>()))
}

pub async fn validate(backend: &Backend, mc: &str, loader: &str, version: Option<&str>) -> Result<()> {
    if loader == "vanilla" { return Ok(()); }
    let available = versions(backend, mc, loader).await?;
    if !available.as_array().unwrap().iter().any(|v| v["loader"]["version"].as_str() == version) {
        return Err(BackendError::new("loader_incompatible", format!("{loader} {} is not available for Minecraft {mc}", version.unwrap_or(""))));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installer_releases_match_exact_minecraft_version() {
        let xml = "<version>1.8.9-11.15.1.2318</version><version>1.8-11.14.4.1563</version><version>1.12.2-14.23.5.2860</version>";
        assert_eq!(installer_versions(xml, "1.8.9", "forge"), ["1.8.9-11.15.1.2318"]);
        assert!(installer_versions(xml, "1.8.8", "forge").is_empty());
        let xml = "<version>21.0.167</version><version>21.1.256</version><version>21.10.1</version><version>26.1.0.10-beta</version><version>26.1.1.2</version><version>26.1.0.0-alpha.2+snapshot-1</version>";
        assert_eq!(installer_versions(xml, "1.21", "neoforge"), ["21.0.167"]);
        assert_eq!(installer_versions(xml, "1.21.1", "neoforge"), ["21.1.256"]);
        assert_eq!(installer_versions(xml, "26.1", "neoforge"), ["26.1.0.10-beta"]);
        assert_eq!(installer_versions(xml, "26.1.1", "neoforge"), ["26.1.1.2"]);
        assert_eq!(installer_versions(xml, "26.1-snapshot-1", "neoforge"), ["26.1.0.0-alpha.2+snapshot-1"]);
        assert!(installer_versions(xml, "1.8.9", "neoforge").is_empty());
    }
    #[test]
    fn legacy_neoforge_uses_its_publisher_artifact() {
        assert!(installer_repository("1.20.1", "neoforge").unwrap().ends_with("/net/neoforged/forge"));
        assert_eq!(installer_versions("<version>1.20.1-47.1.106</version><version>1.20.2-48.0.1</version>", "1.20.1", "neoforge"), ["1.20.1-47.1.106"]);
        assert!(!valid_version("../escape"));
    }
    #[tokio::test]
    #[ignore = "Uses official publisher metadata over the network"]
    async fn real_publisher_compatibility() {
        let root = std::env::temp_dir().join(format!("canary-loader-{}", uuid::Uuid::new_v4()));
        let _cleanup = super::super::storage::Staging(root.clone());
        let backend = Backend::with_root(root).unwrap();
        for (mc, expected) in [("1.8.9", [false,false,true,false]), ("1.12.2", [false,false,true,false]), ("1.20.1", [true,true,true,true]), ("1.21", [true,true,true,true]), ("1.21.1", [true,true,true,true]), ("26.1", [true,true,true,true])] {
            for (loader, supported) in ["fabric", "quilt", "forge", "neoforge"].into_iter().zip(expected) {
                let list = versions(&backend, mc, loader).await.unwrap();
                assert_eq!(!list.as_array().unwrap().is_empty(), supported, "{mc}/{loader}");
            }
        }
        let error = validate(&backend, "1.8.9", "fabric", Some("0.19.5")).await.unwrap_err();
        assert_eq!(error.code, "loader_incompatible");
    }
}
