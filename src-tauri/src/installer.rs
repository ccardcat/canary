use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::{
    collections::HashMap,
    error::Error,
    fs,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
    time::Duration,
};
use zip::ZipArchive;

#[derive(Clone, Debug, Serialize)]
pub struct Progress {
    pub stage: String,
    pub status: String,
    pub file: String,
    pub completed: u64,
    pub total: u64,
    pub downloaded: u64,
    pub bytes_total: u64,
    pub percent: f64,
}
impl Default for Progress {
    fn default() -> Self {
        Self {
            stage: "fetch_version".into(),
            status: "running".into(),
            file: String::new(),
            completed: 0,
            total: 0,
            downloaded: 0,
            bytes_total: 0,
            percent: 0.0,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct InstallError {
    pub stage: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_error: Option<i32>,
    pub causes: Vec<String>,
}
impl InstallError {
    pub fn new(stage: &str, message: impl Into<String>) -> Self {
        Self {
            stage: stage.into(),
            message: message.into(),
            path: None,
            url: None,
            expected_hash: None,
            actual_hash: None,
            os_error: None,
            causes: vec![],
        }
    }
    fn cause(stage: &str, error: impl Error + 'static) -> Self {
        let mut result = Self::new(stage, error.to_string());
        let mut current: Option<&(dyn Error + 'static)> = Some(&error);
        while let Some(e) = current {
            if let Some(io) = e.downcast_ref::<std::io::Error>() {
                result.os_error = io.raw_os_error();
            }
            result.causes.push(e.to_string());
            current = e.source();
        }
        result
    }
    fn path(mut self, path: &Path) -> Self {
        self.path = Some(path.to_string_lossy().into());
        self
    }
    fn url(mut self, url: &str) -> Self {
        self.url = Some(url.into());
        self
    }
}
impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.stage, self.message)
    }
}
impl Error for InstallError {}

type Result<T> = std::result::Result<T, InstallError>;
#[derive(Deserialize)]
struct Version {
    project_id: String,
    files: Vec<VersionFile>,
}
#[derive(Deserialize)]
struct VersionFile {
    url: String,
    filename: String,
    #[serde(default)]
    primary: bool,
    hashes: HashMap<String, String>,
}
#[derive(Deserialize)]
struct Index {
    #[serde(rename = "formatVersion")]
    format_version: u32,
    game: String,
    name: String,
    #[serde(rename = "versionId")]
    version_id: String,
    files: Vec<FileEntry>,
    #[serde(default)]
    dependencies: HashMap<String, String>,
}
#[derive(Deserialize)]
struct FileEntry {
    path: String,
    hashes: HashMap<String, String>,
    downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    file_size: u64,
    #[serde(default)]
    env: HashMap<String, String>,
}

// Check both Windows and Unix semantics regardless of the machine doing validation.
fn safe(base: &Path, rel: &str, stage: &str) -> Result<PathBuf> {
    if matches!(rel.trim_end_matches('/').split('/').next().unwrap_or(""),"pack-content-files.json"|"content.json"|".canary-content"|"instance.json"|"runtime.json"|"loader.json"|"provider-files.json"|"process.json"|"canary-instance.json") {
        return Err(InstallError::new(stage,"Archive cannot replace Canary metadata"));
    }
    let path = Path::new(rel);
    if rel.is_empty()
        || rel.contains('\\')
        || rel.contains(':')
        || path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(InstallError::new(stage, "Unsafe archive path").path(path));
    }
    Ok(base.join(path))
}
fn id_safe(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn verify(data: &[u8], hashes: &HashMap<String, String>, stage: &str, path: &Path) -> Result<()> {
    let (expected, actual) = if let Some(h) = hashes.get("sha512") {
        (h, format!("{:x}", Sha512::digest(data)))
    } else if let Some(h) = hashes.get("sha1") {
        (h, format!("{:x}", sha1::Sha1::digest(data)))
    } else {
        return Err(InstallError::new(stage, "No supported checksum supplied").path(path));
    };
    if !expected.eq_ignore_ascii_case(&actual) {
        let mut error = InstallError::new(stage, "Downloaded file checksum mismatch").path(path);
        error.expected_hash = Some(expected.clone());
        error.actual_hash = Some(actual);
        return Err(error);
    }
    Ok(())
}
fn apply_overrides<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    base: &Path,
    prefix: &str,
    stage: &str,
) -> Result<()> {apply_overrides_job(archive,base,prefix,stage,None)}
fn apply_overrides_job<R:Read+std::io::Seek>(archive:&mut ZipArchive<R>,base:&Path,prefix:&str,stage:&str,job:Option<&crate::backend::download::Job>)->Result<()> {
    for i in 0..archive.len() {
        if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}
        let mut entry = archive
            .by_index(i)
            .map_err(|e| InstallError::cause(stage, e))?;
        let Some(rel) = entry.name().strip_prefix(prefix) else {
            continue;
        };
        // ZIP directory records have no file payload. In particular `overrides/` is the root.
        if rel.is_empty() && entry.is_dir() {
            continue;
        }
        let output = safe(base, rel, stage)?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(
                InstallError::new(stage, "Archive symbolic links are not supported").path(&output),
            );
        }
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|e| InstallError::cause(stage, e).path(&output))?;
            continue;
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|e| InstallError::cause(stage, e).path(parent))?;
        }
        let mut file =
            fs::File::create(&output).map_err(|e| InstallError::cause(stage, e).path(&output))?;
        let mut buf=[0u8;128*1024];loop{if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}let n=entry.read(&mut buf).map_err(|e|InstallError::cause(stage,e))?;if n==0{break;}std::io::Write::write_all(&mut file,&buf[..n]).map_err(|e|InstallError::cause(stage,e))?;}
    }
    Ok(())
}
async fn download_job(client:&reqwest::Client,url:&str,stage:&str,job:Option<&crate::backend::download::Job>)->Result<Vec<u8>> {
    let parsed=reqwest::Url::parse(url).map_err(|e|InstallError::cause(stage,e))?;if parsed.scheme()!="https"{return Err(InstallError::new(stage,"Downloads must use HTTPS"));}
    let file_name=parsed.path().rsplit('/').next().unwrap_or("").to_owned();
    let work=async {let mut response=client.get(parsed).send().await.map_err(|e|InstallError::cause(stage,e))?.error_for_status().map_err(|e|InstallError::cause(stage,e))?;
        if response.url().scheme()!="https"{return Err(InstallError::new(stage,"Insecure redirect rejected"));}
        let mut bytes=vec![];let mut tick=std::time::Instant::now();while let Some(chunk)=response.chunk().await.map_err(|e|InstallError::cause(stage,e))?{bytes.extend_from_slice(&chunk);if let Some(job)=job{use std::sync::atomic::Ordering;job.downloaded.fetch_add(chunk.len() as u64,Ordering::Relaxed);job.network.fetch_add(chunk.len() as u64,Ordering::Relaxed);if tick.elapsed().as_millis()>=120{job.emit(stage,"running",&file_name);tick=std::time::Instant::now();}}}Ok(bytes)};
    tokio::pin!(work);loop{tokio::select!{result=&mut work=>return result,_=tokio::time::sleep(Duration::from_millis(150))=>{if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}}}}
}

fn start<F: FnMut(Progress)>(
    stage: &'static str,
    percent: f64,
    progress: &mut Progress,
    emit: &mut F,
) -> &'static str {
    progress.stage = stage.into();
    progress.status = "running".into();
    progress.percent = percent;
    progress.file.clear();
    eprintln!("[install][{stage}] starting");
    emit(progress.clone());
    stage
}
fn succeeded(stage: &str) {
    eprintln!("[install][{stage}] success");
}

pub async fn install<F:FnMut(Progress)>(project_id:&str,version_id:&str,name:&str,data_dir:&Path,emit:F)->Result<PathBuf>{install_at(project_id,version_id,name,&data_dir.join("Canary/instances"),emit).await}

pub async fn install_at<F: FnMut(Progress)>(
    project_id: &str,
    version_id: &str,
    name: &str,
    instances: &Path,
    mut emit: F,
) -> Result<PathBuf> {
    install_at_job(project_id,version_id,name,instances,None,emit).await
}
pub async fn install_at_job<F:FnMut(Progress)>(project_id:&str,version_id:&str,name:&str,instances:&Path,job:Option<&crate::backend::download::Job>,mut emit:F)->Result<PathBuf>{
    let check=||->Result<()>{if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}Ok(())};
    let mut progress = Progress::default();
    let mut stage = "fetch_version";
    let result = async {
        check()?;
        stage = start("fetch_version", 0.0, &mut progress, &mut emit);
        if !id_safe(project_id) || !id_safe(version_id) {
            return Err(InstallError::new(stage, "Invalid project or version ID"));
        }
        let client = reqwest::Client::builder()
            .user_agent("Canary/0.1.0 (github.com/ccardcat/canary)")
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| InstallError::cause(stage, e))?;
        let url = format!("https://api.modrinth.com/v2/version/{version_id}");
        let version: Version = serde_json::from_slice(&download_job(&client, &url, stage,job).await?)
            .map_err(|e| InstallError::cause(stage, e).url(&url))?;
        if version.project_id != project_id {
            return Err(InstallError::new(stage, "Version belongs to a different project").url(&url));
        }
        let file = version
            .files
            .iter()
            .filter(|f| f.filename.ends_with(".mrpack"))
            .max_by_key(|f| f.primary)
            .ok_or_else(|| InstallError::new(stage, "Version has no .mrpack file"))?;
        check()?;succeeded(stage);
        stage = start("download_mrpack", 2.0, &mut progress, &mut emit);
        let data = download_job(&client, &file.url, stage,job).await?;
        verify(&data, &file.hashes, stage, Path::new(&file.filename)).map_err(|e| e.url(&file.url))?;
        check()?;succeeded(stage);
        stage = start("read_index", 5.0, &mut progress, &mut emit);
        let mut archive =
            ZipArchive::new(Cursor::new(data)).map_err(|e| InstallError::cause(stage, e))?;
        let mut raw = String::new();
        archive
            .by_name("modrinth.index.json")
            .map_err(|e| InstallError::cause(stage, e))?
            .read_to_string(&mut raw)
            .map_err(|e| InstallError::cause(stage, e))?;
        let index: Index = serde_json::from_str(&raw).map_err(|e| InstallError::cause(stage, e))?;
        if index.game != "minecraft" || index.format_version != 1 {
            return Err(InstallError::new(
                stage,
                "Unsupported Modrinth index format or game",
            ));
        }
        let files: Vec<_> = index
            .files
            .iter()
            .filter(|f| f.env.get("client").is_none_or(|e| e != "unsupported"))
            .collect();
        progress.total = files.len() as u64;
        progress.bytes_total = files.iter().map(|f| f.file_size).sum();
        check()?;succeeded(stage);
        stage = start("prepare_instance", 7.0, &mut progress, &mut emit);

        fs::create_dir_all(&instances).map_err(|e| InstallError::cause(stage, e).path(&instances))?;
        let root = instances.join(format!("{project_id}-{version_id}"));
        // A completed installation is reused, never overwritten on a library-write retry.
        let metadata_path = root.join("canary-instance.json");
        if metadata_path.is_file() {
            let metadata: serde_json::Value = serde_json::from_slice(
                &fs::read(&metadata_path)
                    .map_err(|e| InstallError::cause(stage, e).path(&metadata_path))?,
            )
            .map_err(|e| InstallError::cause(stage, e).path(&metadata_path))?;
            if metadata["project_id"] != project_id || metadata["version_id"] != version_id {
                return Err(InstallError::new(
                    stage,
                    "Existing instance metadata does not match the requested version",
                )
                .path(&metadata_path));
            }
            progress.completed = progress.total;
            progress.downloaded = progress.bytes_total;
            check()?;succeeded(stage);
            stage = start("finalize", 98.0, &mut progress, &mut emit);
            check()?;succeeded(stage);
            return Ok(root);
        }
        if root.exists() {
            return Err(InstallError::new(
                stage,
                "Instance folder already exists without valid metadata; preserve it before retrying",
            )
            .path(&root));
        }
        let staging = instances.join(format!(
            ".{project_id}-{version_id}-{}-partial",
            std::process::id()
        ));
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(|e| InstallError::cause(stage, e).path(&staging))?;
        }
        let _cleanup=crate::backend::storage::Staging(staging.clone());
        fs::create_dir(&staging).map_err(|e| InstallError::cause(stage, e).path(&staging))?;
        check()?;succeeded(stage);
        let prepared:Result<()> = async {
                for file in &files {
                    check()?;
                    stage = start(
                        "download_files",
                        10.0 + 78.0 * progress.completed as f64 / progress.total.max(1) as f64,
                        &mut progress,
                        &mut emit,
                    );
                    progress.file = file.path.clone();
                    emit(progress.clone());
                    let output = safe(&staging, &file.path, stage)?;
                    let url = file
                        .downloads
                        .first()
                        .ok_or_else(|| InstallError::new(stage, "Missing download URL").path(&output))?;
                    let bytes = download_job(&client, url, stage,job)
                        .await
                        .map_err(|e| e.path(&output))?;
                    if bytes.len() as u64 != file.file_size {
                        return Err(InstallError::new(
                            stage,
                            format!(
                                "File size mismatch: expected {}, received {}",
                                file.file_size,
                                bytes.len()
                            ),
                        )
                        .path(&output)
                        .url(url));
                    }
                    check()?;succeeded(stage);
                    stage = start("verify_hashes", progress.percent, &mut progress, &mut emit);
                    check()?;verify(&bytes, &file.hashes, stage, &output).map_err(|e| e.url(url))?;
                    if let Some(parent) = output.parent() {
                        fs::create_dir_all(parent).map_err(|e| InstallError::cause(stage, e).path(parent))?;
                    }
                    fs::write(&output, &bytes).map_err(|e| InstallError::cause(stage, e).path(&output))?;
                    progress.completed += 1;
                    progress.downloaded += bytes.len() as u64;
                    progress.file = file.path.clone();
                    emit(progress.clone());
                    eprintln!(
                        "[install][download_files] {}/{} complete",
                        progress.completed, progress.total
                    );
                    check()?;succeeded(stage);
                }
                stage = start("apply_overrides", 90.0, &mut progress, &mut emit);
                apply_overrides_job(&mut archive, &staging, "overrides/", stage,job)?;
                check()?;succeeded(stage);
                stage = start("apply_client_overrides", 94.0, &mut progress, &mut emit);
                apply_overrides_job(&mut archive, &staging, "client-overrides/", stage,job)?;
                check()?;succeeded(stage);
                stage = start("write_instance_metadata", 97.0, &mut progress, &mut emit);
                let metadata = serde_json::json!({"project_id":project_id,"version_id":version_id,"name":name,"instance_path":root,"pack_name":index.name,"pack_version":index.version_id,"dependencies":index.dependencies});
                let path = staging.join("canary-instance.json");
                let data = serde_json::to_vec_pretty(&metadata).map_err(|e| InstallError::cause(stage, e))?;
                fs::write(&path, data).map_err(|e| InstallError::cause(stage, e).path(&path))?;
                let mut content_receipt=vec![];
                for folder in ["mods","shaderpacks","resourcepacks"]{let dir=staging.join(folder);if !dir.is_dir(){continue;}for entry in fs::read_dir(&dir).map_err(|e|InstallError::cause(stage,e))?{check()?;let entry=entry.map_err(|e|InstallError::cause(stage,e))?;if !entry.file_type().map_err(|e|InstallError::cause(stage,e))?.is_file(){continue;}let path=entry.path();if path.extension().is_some_and(|e|e=="jar"||e=="zip"){let hash=crate::backend::download::hash_cancellable(&path,"sha512",job.map(|j|j.cancel.as_ref())).map_err(|e|InstallError::new(if e.code=="cancelled"{"cancelled"}else{stage},e.to_string()))?;content_receipt.push(serde_json::json!({"path":format!("{folder}/{}",entry.file_name().to_string_lossy()),"hash":hash}));}}}
                fs::write(staging.join("pack-content-files.json"),serde_json::to_vec(&content_receipt).map_err(|e|InstallError::cause(stage,e))?).map_err(|e|InstallError::cause(stage,e))?;
                let manifest_path=staging.join("modrinth.index.json");
                fs::write(&manifest_path,&raw).map_err(|e|InstallError::cause(stage,e).path(&manifest_path))?;
                check()?;succeeded(stage);
                stage = start("finalize", 98.0, &mut progress, &mut emit);
                fs::rename(&staging, &root).map_err(|e| InstallError::cause(stage, e).path(&root))?;
                check()?;succeeded(stage);
                Ok(())
            }.await;
        if prepared.is_err() {
            if let Err(e) = fs::remove_dir_all(&staging) {
                eprintln!("[install][cleanup] {}: {}", staging.display(), e);
            }
        }
        prepared?;
        Ok(root)
    }.await;
    if let Err(error) = &result {
        eprintln!(
            "[install][{}] failure {}",
            error.stage,
            serde_json::to_string(error).unwrap_or_else(|_| error.to_string())
        );
        progress.stage = error.stage.clone();
        progress.status = "failure".into();
        emit(progress);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};
    fn temporary(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("canary-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn override_directories_and_client_precedence() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        writer.add_directory("overrides/", options).unwrap();
        writer.add_directory("overrides/config/", options).unwrap();
        writer
            .start_file("overrides/config/options.txt", options)
            .unwrap();
        writer.write_all(b"base").unwrap();
        writer.add_directory("client-overrides/", options).unwrap();
        writer
            .start_file("client-overrides/config/options.txt", options)
            .unwrap();
        writer.write_all(b"client").unwrap();
        let mut archive = ZipArchive::new(writer.finish().unwrap()).unwrap();
        let root = temporary("overrides");
        // The former fs::write(root, payload) path reproduces the reported post-download failure.
        assert!(fs::write(&root, []).is_err());
        apply_overrides(&mut archive, &root, "overrides/", "apply_overrides").unwrap();
        apply_overrides(
            &mut archive,
            &root,
            "client-overrides/",
            "apply_client_overrides",
        )
        .unwrap();
        assert_eq!(
            fs::read(root.join("config/options.txt")).unwrap(),
            b"client"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn override_failure_preserves_stage_path_and_os_cause() {
        let root = temporary("override-error");
        fs::write(root.join("config"), b"a file, not a directory").unwrap();
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("overrides/config/options.txt", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"settings").unwrap();
        let mut archive = ZipArchive::new(writer.finish().unwrap()).unwrap();
        let error =
            apply_overrides(&mut archive, &root, "overrides/", "apply_overrides").unwrap_err();
        assert_eq!(error.stage, "apply_overrides");
        assert!(error.path.unwrap().ends_with("config"));
        assert!(error.os_error.is_some());
        assert!(!error.causes.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_cross_platform_traversal() {
        for path in [
            "../evil",
            "config/../../evil",
            "/absolute",
            "C:/evil",
            "..\\evil",
            "\\\\server\\share",
            "",
        ] {
            assert!(
                safe(Path::new("instances"), path, "apply_overrides").is_err(),
                "{path}"
            );
        }
        assert!(safe(
            Path::new("instances"),
            "config/legitimate..name.json",
            "apply_overrides"
        )
        .is_ok());
    }
    #[test]
    fn checksum_failure_preserves_expected_actual_and_stage() {
        let hashes = HashMap::from([("sha512".into(), "incorrect".into())]);
        let error = verify(
            b"real payload",
            &hashes,
            "verify_hashes",
            Path::new("mods/example.jar"),
        )
        .unwrap_err();
        assert_eq!(error.stage, "verify_hashes");
        assert_eq!(error.expected_hash.as_deref(), Some("incorrect"));
        assert!(error.actual_hash.is_some());
        assert_eq!(error.path.as_deref(), Some("mods/example.jar"));
    }
    #[test]
    fn reads_real_modrinth_field_names_and_optional_environment() {
        let file:FileEntry=serde_json::from_str(r#"{"path":"mods/test.jar","hashes":{"sha512":"abc"},"downloads":["https://cdn.modrinth.com/test"],"fileSize":42}"#).unwrap();
        assert_eq!(file.file_size, 42);
        assert!(file.env.is_empty());
        let index:Index=serde_json::from_str(r#"{"formatVersion":1,"game":"minecraft","name":"Test","versionId":"not-a-project-version-id","files":[]}"#).unwrap();
        assert_eq!(index.version_id, "not-a-project-version-id");
    }
    #[test]
    #[ignore = "Downloads a real Modrinth pack; run explicitly when network is available"]
    fn real_modrinth_install() {
        let root = temporary("real-install");
        let path = tauri::async_runtime::block_on(install(
            "1KVo5zza",
            "9toQ7Bv7",
            "Fabulously Optimized",
            &root,
            |p| eprintln!("{} {} {}%", p.stage, p.file, p.percent),
        ))
        .unwrap();
        assert!(path.join("canary-instance.json").is_file());
        assert!(path.join("mods").read_dir().unwrap().count() > 0);
        let before = fs::read(path.join("canary-instance.json")).unwrap();
        let reused = tauri::async_runtime::block_on(install(
            "1KVo5zza",
            "9toQ7Bv7",
            "Fabulously Optimized",
            &root,
            |_| {},
        ))
        .unwrap();
        assert_eq!(reused, path);
        assert_eq!(fs::read(path.join("canary-instance.json")).unwrap(), before);
        fs::remove_dir_all(root).unwrap();
    }
}
