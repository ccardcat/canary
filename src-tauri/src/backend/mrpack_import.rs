use super::{
    download::{self, Artifact, Job},
    model::*,
    storage, Backend,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    path::Path,
    sync::Arc,
};
const MAX_ARCHIVE: u64 = 512 * 1024 * 1024;
const MAX_EXPANDED: u64 = 2 * 1024 * 1024 * 1024;
#[derive(Deserialize)]
struct Index {
    #[serde(rename = "formatVersion")]
    format: u32,
    game: String,
    name: String,
    #[serde(rename = "versionId")]
    version: String,
    dependencies: HashMap<String, String>,
    files: Vec<Entry>,
}
#[derive(Deserialize)]
struct Entry {
    path: String,
    hashes: HashMap<String, String>,
    downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    size: u64,
    #[serde(default)]
    env: HashMap<String, String>,
}
#[derive(Clone, Serialize)]
pub struct Preview {
    pub path: String,
    pub name: String,
    pub minecraft: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub version: String,
    pub files: usize,
    pub download_bytes: u64,
    pub archive_bytes: u64,
    pub sha256: String,
}
fn archive_error(message: impl Into<String>) -> BackendError {
    BackendError::new("mrpack_archive", message)
}
fn target(base: &Path, relative: &str) -> Result<std::path::PathBuf> {
    let first = relative.split('/').next().unwrap_or("").to_lowercase();
    if matches!(
        first.as_str(),
        "saves"
            | "screenshots"
            | "logs"
            | "instance.json"
            | "canary-instance.json"
            | "modrinth.index.json"
            | "mrpack-source.json"
            | "runtime.json"
            | "loader.json"
            | "process.json"
            | "content.json"
            | "pack-content-files.json"
            | "provider-files.json"
            | ".canary-content"
            | "input.mrpack"
    ) {
        return Err(archive_error(
            "The archive cannot manage worlds or Canary metadata",
        ));
    }
    storage::safe_join(base, relative)
        .map_err(|_| archive_error("The archive contains an unsafe file path"))
}
fn source_url(url: &str) -> Result<()> {
    let url = reqwest::Url::parse(url).map_err(|_| archive_error("Invalid file download URL"))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(archive_error(
            "Pack file downloads must use HTTPS without embedded credentials",
        ));
    }
    Ok(())
}
fn validate(index: &Index) -> Result<(String, String, Option<String>, u64)> {
    if index.format != 1
        || index.game != "minecraft"
        || index.name.trim().is_empty()
        || index.name.len() > 256
        || index.files.len() > 50_000
    {
        return Err(archive_error("Unsupported or invalid Modrinth index"));
    }
    let valid_version = |v: &str| {
        !v.is_empty()
            && v.len() <= 96
            && v.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    };
    let mc = index
        .dependencies
        .get("minecraft")
        .filter(|v| valid_version(v))
        .ok_or_else(|| archive_error("Minecraft version is missing or invalid"))?
        .clone();
    let loaders: Vec<_> = index
        .dependencies
        .iter()
        .filter(|(k, _)| k.as_str() != "minecraft")
        .collect();
    if loaders.len() > 1 {
        return Err(BackendError::new(
            "mrpack_loader",
            "The pack declares incompatible loaders",
        ));
    }
    let (loader, version) = if let Some((key, version)) = loaders.first() {
        let loader = match key.as_str() {
            "fabric-loader" => "fabric",
            "quilt-loader" => "quilt",
            "forge" => "forge",
            "neoforge" => "neoforge",
            _ => {
                return Err(BackendError::new(
                    "mrpack_loader",
                    "The pack uses an unsupported loader",
                ))
            }
        };
        if !valid_version(version) {
            return Err(BackendError::new("mrpack_loader", "Invalid loader version"));
        }
        (loader.to_owned(), Some((*version).clone()))
    } else {
        ("vanilla".into(), None)
    };
    let mut paths = HashSet::new();
    let mut bytes = 0u64;
    for file in &index.files {
        if file
            .env
            .get("client")
            .is_some_and(|v| !matches!(v.as_str(), "required" | "optional" | "unsupported"))
        {
            return Err(archive_error(
                "Invalid client environment in the pack index",
            ));
        }
        if file.env.get("client").is_some_and(|v| v == "unsupported") {
            continue;
        }
        target(Path::new("validated-pack"), &file.path)?;
        if !paths.insert(file.path.to_lowercase()) {
            return Err(archive_error("Duplicate file paths in the pack"));
        }
        let hash = file
            .hashes
            .get("sha512")
            .map(|h| (h, 128))
            .or_else(|| file.hashes.get("sha1").map(|h| (h, 40)))
            .ok_or_else(|| archive_error("A file has no SHA-512 or SHA-1 checksum"))?;
        if hash.0.len() != hash.1 || !hash.0.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(archive_error("Invalid file checksum"));
        }
        source_url(
            file.downloads
                .first()
                .ok_or_else(|| archive_error("A file has no download source"))?,
        )?;
        bytes = bytes
            .checked_add(file.size)
            .ok_or_else(|| archive_error("Pack size overflow"))?;
    }
    Ok((mc, loader, version, bytes))
}
fn read(path: &Path) -> Result<(Index, Preview, u64)> {
    let metadata = std::fs::metadata(path)?;
    if !metadata.is_file()
        || metadata.len() > MAX_ARCHIVE
        || !path
            .extension()
            .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("mrpack"))
    {
        return Err(archive_error("Choose a .mrpack archive up to 512 MiB"));
    }
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)
        .map_err(|_| archive_error("Invalid or damaged MRPACK archive"))?;
    if zip.len() > 50_000 {
        return Err(archive_error("Too many archive entries"));
    }
    let mut expanded = 0u64;
    let mut names = HashSet::new();
    for n in 0..zip.len() {
        let entry = zip
            .by_index(n)
            .map_err(|_| archive_error("Cannot read archive entry"))?;
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            return Err(archive_error("Archive symbolic links are not supported"));
        }
        let name = entry.name().trim_end_matches('/');
        if name.is_empty() {
            continue;
        }
        storage::safe_join(Path::new("archive-check"), name)
            .map_err(|_| archive_error("Unsafe archive path"))?;
        if !names.insert(name.to_lowercase()) {
            return Err(archive_error("Duplicate archive entries"));
        }
        if let Some(rel) = name
            .strip_prefix("overrides/")
            .or_else(|| name.strip_prefix("client-overrides/"))
        {
            if !rel.is_empty() {
                target(Path::new("override-check"), rel)?;
            }
        }
        expanded = expanded
            .checked_add(entry.size())
            .filter(|v| *v <= MAX_EXPANDED)
            .ok_or_else(|| archive_error("Expanded archive exceeds 2 GiB"))?;
    }
    let entry = zip
        .by_name("modrinth.index.json")
        .map_err(|_| archive_error("The archive has no modrinth.index.json"))?;
    if entry.size() > 16 * 1024 * 1024 {
        return Err(archive_error("Modrinth index exceeds 16 MiB"));
    }
    let mut bytes = vec![];
    entry.take(16 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    let index: Index =
        serde_json::from_slice(&bytes).map_err(|_| archive_error("Invalid Modrinth index JSON"))?;
    let (minecraft, loader, loader_version, download_bytes) = validate(&index)?;
    for file in &index.files {
        if file.path.starts_with("mods/") || file.path.starts_with("libraries/") {
            for prefix in ["overrides/", "client-overrides/"] {
                if names.contains(&format!("{prefix}{}", file.path).to_lowercase()) {
                    return Err(archive_error(
                        "An override conflicts with a verified mod or library file",
                    ));
                }
            }
        }
    }
    let preview = Preview {
        path: path.to_string_lossy().into_owned(),
        name: index.name.clone(),
        minecraft,
        loader,
        loader_version,
        version: index.version.clone(),
        files: index
            .files
            .iter()
            .filter(|f| f.env.get("client").is_none_or(|v| v != "unsupported"))
            .count(),
        download_bytes,
        archive_bytes: metadata.len(),
        sha256: download::hash(path, "sha256")?,
    };
    Ok((index, preview, expanded))
}
pub fn inspect(path: &Path) -> Result<Preview> {
    Ok(read(path)?.1)
}
fn overrides(archive: &Path, stage: &Path, job: &Job) -> Result<()> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?)
        .map_err(|_| archive_error("Cannot reopen archive"))?;
    for prefix in ["overrides/", "client-overrides/"] {
        for n in 0..zip.len() {
            job.check()?;
            let mut entry = zip
                .by_index(n)
                .map_err(|_| archive_error("Cannot read override"))?;
            let Some(rel) = entry
                .name()
                .strip_prefix(prefix)
                .map(|s| s.trim_end_matches('/').to_owned())
            else {
                continue;
            };
            if rel.is_empty() {
                continue;
            }
            let path = target(stage, &rel)?;
            if entry.is_dir() {
                std::fs::create_dir_all(path)?;
                continue;
            }
            std::fs::create_dir_all(path.parent().unwrap())?;
            let mut file = std::fs::File::create(path)?;
            let expected = entry.size();
            let copied = std::io::copy(&mut (&mut entry).take(expected + 1), &mut file)?;
            if copied != expected {
                return Err(archive_error(
                    "Override length differs from its archive entry",
                ));
            }
        }
    }
    Ok(())
}
pub async fn import(
    backend: Arc<Backend>,
    path: std::path::PathBuf,
    expected_hash: String,
    name: Option<String>,
    job: Arc<Job>,
) -> Result<Instance> {
    job.check()?;
    if uuid::Uuid::parse_str(&job.id).is_err() {
        return Err(archive_error("Invalid import request ID"));
    }
    let root = backend.instances_root();
    let id=job.operation_id();
    let destination = backend.instance_path(&id)?;
    if destination.exists() {
        return Err(BackendError::new(
            "content_duplicate",
            "An instance with this request ID already exists",
        ));
    }
    let stage = destination.parent().unwrap().join(format!(".mrpack-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&stage)?;
    let _cleanup = storage::Staging(stage.clone());
    job.emit("mrpack_prepare", "running", "Validating archive");
    let archive = stage.join("input.mrpack");
    let source = path.clone();
    let copy = archive.clone();
    tokio::task::spawn_blocking(move || -> Result<()> {
        if std::fs::metadata(&source)?.len() > MAX_ARCHIVE {
            return Err(archive_error("Archive exceeds 512 MiB"));
        }
        std::fs::copy(source, copy)?;
        Ok(())
    })
    .await
    .map_err(|_| archive_error("Cannot copy the source archive"))??;
    let prepared = archive.clone();
    let (index, preview, expanded) = tokio::task::spawn_blocking(move || read(&prepared))
        .await
        .map_err(|_| archive_error("Cannot inspect the source archive"))??;
    if preview.sha256 != expected_hash {
        return Err(BackendError::new(
            "mrpack_changed",
            "The archive changed after preview. Choose it again.",
        ));
    }
    let needed = preview
        .download_bytes
        .checked_add(expanded)
        .and_then(|v| v.checked_add(64 * 1024 * 1024))
        .ok_or_else(|| archive_error("Pack size overflow"))?;
    if fs2::available_space(&root)? < needed {
        return Err(BackendError::new(
            "disk_space",
            "Insufficient free space for the pack files and overrides",
        ));
    }
    job.check()?;
    let mut artifacts = vec![];
    for file in &index.files {
        if file.env.get("client").is_some_and(|v| v == "unsupported") {
            continue;
        }
        let (algorithm, hash) = if let Some(h) = file.hashes.get("sha512") {
            ("sha512", h)
        } else {
            ("sha1", file.hashes.get("sha1").unwrap())
        };
        artifacts.push(Artifact {
            url: file.downloads[0].clone(),
            path: target(&stage, &file.path)?,
            hash: Some(hash.clone()),
            algorithm,
            size: Some(file.size),
        });
    }
    download::batch(backend.clone(), artifacts, job.clone(), "mrpack_downloads").await?;
    job.emit("mrpack_overrides", "running", "Installing overrides");
    let copied = stage.clone();
    let input = archive.clone();
    let token = job.clone();
    tokio::task::spawn_blocking(move || overrides(&input, &copied, &token))
        .await
        .map_err(|_| archive_error("Cannot install overrides"))??;
    job.check()?;
    for folder in [
        "mods",
        "config",
        "resourcepacks",
        "shaderpacks",
        "saves",
        "screenshots",
        "logs",
    ] {
        std::fs::create_dir_all(stage.join(folder))?;
    }
    let raw: serde_json::Value = {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&archive)?)
            .map_err(|_| archive_error("Cannot read manifest"))?;
        let mut data = String::new();
        zip.by_name("modrinth.index.json")
            .map_err(|_| archive_error("Missing manifest"))?
            .read_to_string(&mut data)?;
        serde_json::from_str(&data).map_err(|_| archive_error("Invalid manifest"))?
    };
    storage::write_json(&stage.join("modrinth.index.json"), &raw)?;
    storage::write_json(
        &stage.join("mrpack-source.json"),
        &serde_json::json!({"sha256":preview.sha256,"filename":path.file_name().unwrap_or_default(),"version":preview.version}),
    )?;
    let inventory = index
        .files
        .iter()
        .filter(|f| f.env.get("client").is_none_or(|v| v != "unsupported"))
        .map(|f| {
            Ok((
                f.path.clone(),
                std::fs::metadata(target(&stage, &f.path)?)?.len(),
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    storage::write_json(&stage.join("provider-files.json"), &inventory)?;
    let mut content = vec![];
    for folder in ["mods", "resourcepacks", "shaderpacks"] {
        for entry in std::fs::read_dir(stage.join(folder))? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                content.push(serde_json::json!({"path":format!("{folder}/{}",entry.file_name().to_string_lossy()),"hash":download::hash_cancellable(&entry.path(),"sha512",Some(&job.cancel))?}));
            }
        }
    }
    storage::write_json(&stage.join("pack-content-files.json"), &content)?;
    let name = name
        .filter(|v| !v.trim().is_empty())
        .unwrap_or(preview.name);
    if name.len() > 256 {
        return Err(archive_error("Instance name is too long"));
    }
    let instance = Instance {
        id: id.clone(),
        name: name.trim().into(),
        provider: "mrpack".into(),
        version_name: preview.version,
        minecraft: preview.minecraft,
        loader: preview.loader,
        loader_version: preview.loader_version,
        directory: destination.to_string_lossy().into(),
        status: "installed".into(),
        installed: now(),
        ..Instance::default()
    };
    storage::write_json(&stage.join("instance.json"), &instance)?;
    std::fs::remove_file(archive)?;
    job.check()?;
    job.emit("mrpack_finalize", "running", &instance.name);
    std::fs::rename(&stage, &destination)?;
    if let Err(error) = backend.save_instance(&instance) {
        let _ = std::fs::rename(&destination, &stage);
        backend
            .store
            .lock()
            .unwrap()
            .instance_catalog
            .retain(|i| i.id != instance.id);
        return Err(error);
    }
    Ok(instance)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn archive(
        root: &Path,
        index: Option<serde_json::Value>,
        override_path: &str,
    ) -> std::path::PathBuf {
        let path = root.join("fixture.mrpack");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        use std::io::Write;
        if let Some(index) = index {
            zip.start_file("modrinth.index.json", options).unwrap();
            zip.write_all(index.to_string().as_bytes()).unwrap();
        }
        zip.start_file(override_path, options).unwrap();
        zip.write_all(b"user-safe fixture override").unwrap();
        zip.finish().unwrap();
        path
    }
    fn index() -> serde_json::Value {
        serde_json::json!({"formatVersion":1,"game":"minecraft","name":"MRPACK fixture","versionId":"test","dependencies":{"minecraft":"1.21.1"},"files":[]})
    }
    #[test]
    fn rejects_missing_index_unsafe_overrides_and_incompatible_loaders() {
        let root = std::env::temp_dir().join(format!("mrpack-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let _cleanup = storage::Staging(root.clone());
        assert!(inspect(&archive(&root, None, "overrides/config/a.txt")).is_err());
        for rel in [
            "overrides/../escape.txt",
            "overrides/instance.json",
            "overrides/Instance.json",
            "overrides/input.mrpack",
            "overrides/saves/world/level.dat",
        ] {
            assert!(inspect(&archive(&root, Some(index()), rel)).is_err());
        }
        let mut invalid = index();
        invalid["dependencies"]["forge"] = serde_json::json!("52.0.1");
        invalid["dependencies"]["fabric-loader"] = serde_json::json!("0.16.0");
        assert_eq!(
            inspect(&archive(&root, Some(invalid), "overrides/config/a.txt"))
                .err()
                .unwrap()
                .code,
            "mrpack_loader"
        );
    }
    #[tokio::test]
    async fn import_commits_verified_metadata_and_preserves_existing_worlds() {
        let root = std::env::temp_dir().join(format!("mrpack-import-{}", uuid::Uuid::new_v4()));
        let backend = Arc::new(Backend::with_root(root.clone()).unwrap());
        let _cleanup = storage::Staging(root.clone());
        std::fs::create_dir_all(root.join("instances/existing/saves/World")).unwrap();
        std::fs::write(
            root.join("instances/existing/saves/World/level.dat"),
            b"original world marker",
        )
        .unwrap();
        let archive = archive(&root, Some(index()), "overrides/config/test.txt");
        let p = inspect(&archive).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let lease = backend.lease(&id).unwrap();
        let job = Arc::new(Job::new(&id, None, lease.cancel.clone()));
        let instance = import(backend.clone(), archive, p.sha256, None, job)
            .await
            .unwrap();
        assert_eq!(instance.provider, "mrpack");
        assert_eq!(
            std::fs::read(Path::new(&instance.directory).join("config/test.txt")).unwrap(),
            b"user-safe fixture override"
        );
        assert_eq!(backend.instance(&id).unwrap().minecraft, "1.21.1");
        assert_eq!(
            std::fs::read(root.join("instances/existing/saves/World/level.dat")).unwrap(),
            b"original world marker"
        );
    }
    #[tokio::test]
    async fn changed_archive_rolls_back_without_publishing_an_instance() {
        let root = std::env::temp_dir().join(format!("mrpack-changed-{}", uuid::Uuid::new_v4()));
        let backend = Arc::new(Backend::with_root(root.clone()).unwrap());
        let _cleanup = storage::Staging(root.clone());
        let archive = archive(&root, Some(index()), "overrides/config/test.txt");
        let id = uuid::Uuid::new_v4().to_string();
        let lease = backend.lease(&id).unwrap();
        let job = Arc::new(Job::new(&id, None, lease.cancel.clone()));
        assert_eq!(
            import(backend.clone(), archive, "changed".into(), None, job)
                .await
                .err()
                .unwrap()
                .code,
            "mrpack_changed"
        );
        assert!(!backend.instances_root().join(id).exists());
        assert_eq!(
            std::fs::read_dir(backend.instances_root()).unwrap().count(),
            0
        );
    }
    #[tokio::test]
    #[ignore = "Imports a real official MRPACK into a disposable local instance"]
    async fn real_local_archive_import() {
        let root =
            std::env::temp_dir().join(format!("canary-real-mrpack-{}", uuid::Uuid::new_v4()));
        let backend = Arc::new(Backend::with_root(root.clone()).unwrap());
        let _cleanup = storage::Staging(root.clone());
        let versions=download::json(&backend,"https://api.modrinth.com/v2/project/1KVo5zza/version?game_versions=%5B%221.21.1%22%5D&loaders=%5B%22fabric%22%5D").await.unwrap();
        let file = versions.as_array().unwrap()[0]["files"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["filename"].as_str().unwrap().ends_with(".mrpack"))
            .unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let lease = backend.lease(&id).unwrap();
        let job = Arc::new(Job::new(&id, None, lease.cancel.clone()));
        let archive = root.join("downloaded.mrpack");
        download::batch(
            backend.clone(),
            vec![Artifact {
                url: file["url"].as_str().unwrap().into(),
                path: archive.clone(),
                hash: Some(file["hashes"]["sha512"].as_str().unwrap().into()),
                algorithm: "sha512",
                size: file["size"].as_u64(),
            }],
            job.clone(),
            "mrpack_source",
        )
        .await
        .unwrap();
        let preview = inspect(&archive).unwrap();
        assert!(preview.files > 0);
        assert_eq!(preview.loader, "fabric");
        let instance = import(backend.clone(), archive, preview.sha256, None, job)
            .await
            .unwrap();
        let content = super::super::content::scan(&backend, &instance.id).unwrap();
        assert!(!content.items.is_empty());
        assert!(content.items.iter().all(|i| i.canary_managed));
        for item in &content.items {
            assert_eq!(
                item.hash,
                download::hash(&Path::new(&instance.directory).join(&item.path), "sha512").unwrap()
            );
        }
        assert_eq!(
            Backend::with_root(root)
                .unwrap()
                .instance(&id)
                .unwrap()
                .provider,
            "mrpack"
        );
        println!(
            "REAL_MRPACK_PREVIEW_DOWNLOAD_HASH_OVERRIDES_METADATA_CONTENT_PERSISTENCE_VERIFIED"
        );
    }
}
