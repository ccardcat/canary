use serde::{Deserialize, Serialize};
#[cfg(test)]
use sha2::{Digest, Sha512};
use std::{
    collections::HashMap,
    error::Error,
    fs,
    io::Read,
    path::{Path, PathBuf},
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
            message: crate::backend::privacy::diagnostic(&message.into()),
            path: None,
            url: None,
            expected_hash: None,
            actual_hash: None,
            os_error: None,
            causes: vec![],
        }
    }
    fn cause(stage: &str, error: impl Error + 'static) -> Self {
        let mut result = Self::new(stage, crate::backend::privacy::diagnostic(&error.to_string()));
        let mut current: Option<&(dyn Error + 'static)> = Some(&error);
        while let Some(e) = current {
            if let Some(io) = e.downcast_ref::<std::io::Error>() {
                result.os_error = io.raw_os_error();
            }
            result.causes.push(crate::backend::privacy::diagnostic(&e.to_string()));
            current = e.source();
        }
        result
    }
    fn path(mut self, path: &Path) -> Self {
        self.path = Some(crate::backend::privacy::diagnostic(&path.to_string_lossy()));
        self
    }
    fn url(mut self, url: &str) -> Self {
        self.url = Some(crate::backend::privacy::diagnostic(url));
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
    size: Option<u64>,
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
    crate::backend::storage::pack_path(base,rel).map_err(|e|InstallError::new(stage,e.message).path(Path::new(rel)))
}
fn id_safe(id: &str) -> bool {
    !id.is_empty() && id.len() <= 96
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
#[cfg(test)]
fn verify(data: &[u8], hashes: &HashMap<String, String>, stage: &str, path: &Path) -> Result<()> {
    let (expected, actual) = if let Some(h) = hashes.get("sha512") {
        (h, crate::backend::download::hex(Sha512::digest(data)))
    } else if let Some(h) = hashes.get("sha1") {
        (h, crate::backend::download::hex(sha1::Sha1::digest(data)))
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
#[cfg(test)]
fn apply_overrides<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    base: &Path,
    prefix: &str,
    stage: &str,
) -> Result<()> {apply_overrides_job(archive,base,prefix,stage,None)}
fn apply_overrides_job<R:Read+std::io::Seek>(archive:&mut ZipArchive<R>,base:&Path,prefix:&str,stage:&str,job:Option<&crate::backend::download::Job>)->Result<()> {
    let limits=crate::backend::storage::ExtractionLimits::default();
    let mut budget=crate::backend::storage::ExtractionBudget::new(limits);let mut names=std::collections::HashSet::new();
    for i in 0..archive.len() {
        let entry=archive.by_index(i).map_err(|e|InstallError::cause(stage,e))?;
        budget.entry(entry.size()).map_err(|e|InstallError::new(stage,e.message))?;
        let name=entry.name().map_err(|e|InstallError::cause(stage,e))?.into_owned();
        if let Some(rel)=name.strip_prefix(prefix) {let rel=rel.trim_end_matches('/');if rel.is_empty()&&entry.is_dir(){continue;}
            safe(base,rel,stage)?;
            if entry.unix_mode().is_some_and(|m|m&0o170000==0o120000)||!names.insert(rel.to_ascii_lowercase()){return Err(InstallError::new(stage,"Unsafe link or duplicate archive destination"));}
        }
    }
    for i in 0..archive.len() {
        if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}
        let mut entry = archive
            .by_index(i)
            .map_err(|e| InstallError::cause(stage, e))?;
        let name = entry.name().map_err(|e| InstallError::cause(stage, e))?.into_owned();
        let Some(rel) = name.strip_prefix(prefix) else {
            continue;
        };
        // ZIP directory records have no file payload. In particular `overrides/` is the root.
        if rel.is_empty() && entry.is_dir() {
            continue;
        }
        let output = safe(base, rel.trim_end_matches('/'), stage)?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(
                InstallError::new(stage, "Archive symbolic links are not supported").path(&output),
            );
        }
        if entry.is_dir() {
            crate::backend::protected_fs::create_dir_all(&output).map_err(|e| InstallError::cause(stage, e).path(&output))?;
            continue;
        }
        if let Some(parent) = output.parent() {
            crate::backend::protected_fs::create_dir_all(parent).map_err(|e| InstallError::cause(stage, e).path(parent))?;
        }
        let mut file =
            crate::backend::protected_fs::create(&output).map_err(|e| InstallError::cause(stage, e).path(&output))?;
        let declared=entry.size();let mut actual=0u64;let mut buf=[0u8;128*1024];loop{if let Some(job)=job{job.check().map_err(|e|InstallError::new("cancelled",e.message))?;}let n=entry.read(&mut buf).map_err(|e|InstallError::cause(stage,e))?;if n==0{break;}actual=actual.checked_add(n as u64).filter(|v|*v<=declared).ok_or_else(||InstallError::new(stage,"Archive entry exceeds declared size"))?;std::io::Write::write_all(&mut file,&buf[..n]).map_err(|e|InstallError::cause(stage,e))?;}
    }
    Ok(())
}
fn job_check(job:Option<&crate::backend::download::Job>)->Result<()> {
    if let Some(job)=job {job.check().map_err(|e|InstallError::new("cancelled",e.message))?;} Ok(())
}
async fn download_job(client:&reqwest::Client,url:&str,stage:&str,job:Option<&crate::backend::download::Job>)->Result<Vec<u8>> {
    let parsed=reqwest::Url::parse(url).map_err(|e|InstallError::cause(stage,e))?;
    crate::backend::network::request_url(&parsed).map_err(|e|InstallError::new(stage,e.message))?;
    let work=async {let response=client.get(parsed).send().await.map_err(|e|InstallError::cause(stage,e))?.error_for_status().map_err(|e|InstallError::cause(stage,e))?;
        crate::backend::network::bytes(response,16*1024*1024).await.map_err(|e|InstallError::new(stage,e.message))};
    tokio::pin!(work);loop{tokio::select!{result=&mut work=>return result,_=tokio::time::sleep(Duration::from_millis(150))=>job_check(job)?}}
}
async fn download_to(client:&reqwest::Client,url:&str,path:&Path,hashes:&HashMap<String,String>,size:Option<u64>,stage:&str,job:Option<&crate::backend::download::Job>)->Result<u64> {
    use crate::backend::{download,network,protected_fs};
    use tokio::io::AsyncWriteExt;
    use std::io::Seek;
    let (expected,algorithm)=hashes.get("sha512").map(|h|(h.clone(),"sha512")).or_else(||hashes.get("sha1").map(|h|(h.clone(),"sha1"))).ok_or_else(||InstallError::new(stage,"No supported checksum supplied"))?;
    download::validate_hash(&expected,algorithm).map_err(|e|InstallError::new(stage,e.message))?;
    let parsed=reqwest::Url::parse(url).map_err(|e|InstallError::cause(stage,e))?;
    network::request_url(&parsed).map_err(|e|InstallError::new(stage,e.message))?;
    if size.is_some_and(|v|v>download::MAX_FILE_BYTES){return Err(InstallError::new(stage,"File exceeds the 16 GiB download budget"));}
    let parent=protected_fs::Parent::new(path,true).map_err(|e|InstallError::cause(stage,e).path(path))?;
    let (temporary,file)=parent.temporary().map_err(|e|InstallError::cause(stage,e))?;
    let _cleanup=parent.guard(&temporary).map_err(|e|InstallError::cause(stage,e))?;
    let work=async {
        let mut response=client.get(parsed).send().await.map_err(|e|InstallError::cause(stage,e))?.error_for_status().map_err(|e|InstallError::cause(stage,e))?;
        let length=size.or(response.content_length());
        if length.is_some_and(|v|v>download::MAX_FILE_BYTES){return Err(InstallError::new(stage,"File exceeds the download budget"));}
        if length.is_some_and(|v|fs2::available_space(path.parent().unwrap()).is_ok_and(|free|free<v.saturating_add(64*1024*1024))){return Err(InstallError::new(stage,"Insufficient free disk space"));}
        let mut output=tokio::fs::File::from_std(file);let mut received=0u64;let mut tick=std::time::Instant::now();
        while let Some(chunk)=response.chunk().await.map_err(|e|InstallError::cause(stage,e))? {
            job_check(job)?;
            received=received.checked_add(chunk.len() as u64).filter(|v|*v<=length.unwrap_or(download::MAX_FILE_BYTES).min(download::MAX_FILE_BYTES)).ok_or_else(||InstallError::new(stage,"Download exceeds its declared size or budget"))?;
            output.write_all(&chunk).await.map_err(|e|InstallError::cause(stage,e))?;
            if let Some(job)=job {use std::sync::atomic::Ordering;job.network.fetch_add(chunk.len() as u64,Ordering::Relaxed);job.downloaded.fetch_add(chunk.len() as u64,Ordering::Relaxed);if tick.elapsed().as_millis()>=120 {job.emit(stage,"running",&path.file_name().unwrap_or_default().to_string_lossy());tick=std::time::Instant::now();}}
            if fs2::available_space(path.parent().unwrap()).is_ok_and(|free|free<64*1024*1024){return Err(InstallError::new(stage,"Download stopped before exhausting disk space"));}
        }
        output.flush().await.map_err(|e|InstallError::cause(stage,e))?;output.sync_all().await.map_err(|e|InstallError::cause(stage,e))?;
        if length.is_some_and(|v|v!=received){return Err(InstallError::new(stage,"Downloaded length does not match metadata"));}
        let mut file=output.into_std().await;file.rewind().map_err(|e|InstallError::cause(stage,e))?;
        let cancel=job.map(|j|j.cancel.clone());
        let actual=tokio::task::spawn_blocking(move||download::hash_reader(&mut file,algorithm,cancel.as_deref())).await.map_err(|e|InstallError::cause(stage,e))?.map_err(|e|InstallError::new(stage,e.message))?;
        if !actual.eq_ignore_ascii_case(&expected){let mut error=InstallError::new("verify_hashes","Downloaded file checksum mismatch").path(path);error.expected_hash=Some(expected);error.actual_hash=Some(actual);return Err(error);}
        job_check(job)?;parent.commit(&temporary).map_err(|e|InstallError::cause(stage,e))?;Ok(received)
    };
    tokio::pin!(work);loop{tokio::select!{result=&mut work=>return result,_=tokio::time::sleep(Duration::from_millis(150))=>job_check(job)?}}
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

#[cfg(test)]
pub async fn install<F:FnMut(Progress)>(project_id:&str,version_id:&str,name:&str,data_dir:&Path,emit:F)->Result<PathBuf>{install_at(project_id,version_id,name,&data_dir.join("Canary/instances"),emit).await}

pub async fn install_at<F: FnMut(Progress)>(
    project_id: &str,
    version_id: &str,
    name: &str,
    instances: &Path,
    emit: F,
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
        let client = crate::backend::network::client_builder()
            .user_agent(concat!("Canary/",env!("CARGO_PKG_VERSION")," (github.com/ccardcat/canary)"))
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
        crate::backend::protected_fs::create_dir_all(instances).map_err(|e|InstallError::cause(stage,e))?;
        let package=instances.join(format!(".modrinth-package-{}",uuid::Uuid::new_v4()));
        crate::backend::protected_fs::create_dir(&package).map_err(|e|InstallError::cause(stage,e))?;
        let _package_cleanup=crate::backend::storage::Staging(package.clone());
        let package_path=package.join("input.mrpack");
        download_to(&client,&file.url,&package_path,&file.hashes,file.size,stage,job).await.map_err(|e|e.url(&file.url))?;
        // Shared typed preflight rejects malformed manifests, reserved destinations,
        // checksum omissions, archive bombs and duplicate/ambiguous paths.
        crate::backend::mrpack_import::inspect(&package_path).map_err(|e|InstallError::new("read_index",e.message))?;
        check()?;succeeded(stage);
        stage = start("read_index", 5.0, &mut progress, &mut emit);
        let mut archive =
            ZipArchive::new(crate::backend::protected_fs::open(&package_path).map_err(|e|InstallError::cause(stage,e))?).map_err(|e| InstallError::cause(stage, e))?;
        let mut raw = String::new();
        archive
            .by_name("modrinth.index.json")
            .map_err(|e| InstallError::cause(stage, e))?
            .take(16*1024*1024+1)
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
        progress.bytes_total = files.iter().try_fold(0u64,|sum,f|sum.checked_add(f.file_size)).ok_or_else(||InstallError::new(stage,"Manifest size overflow"))?;
        check()?;succeeded(stage);
        stage = start("prepare_instance", 7.0, &mut progress, &mut emit);

        crate::backend::protected_fs::create_dir_all(&instances).map_err(|e| InstallError::cause(stage, e).path(&instances))?;
        let root = instances.join(format!("{project_id}-{version_id}"));
        // A completed installation is reused, never overwritten on a library-write retry.
        let metadata_path = root.join("canary-instance.json");
        if metadata_path.is_file() {
            let metadata: serde_json::Value = serde_json::from_slice(
                &crate::backend::protected_fs::read(&metadata_path)
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
        let staging = instances.join(format!(".{project_id}-{version_id}-{}-partial",uuid::Uuid::new_v4()));
        let _cleanup=crate::backend::storage::Staging(staging.clone());
        crate::backend::protected_fs::create_dir(&staging).map_err(|e| InstallError::cause(stage, e).path(&staging))?;
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
                    let received=download_to(&client,url,&output,&file.hashes,Some(file.file_size),stage,job).await.map_err(|e|e.path(&output).url(url))?;
                    check()?;succeeded(stage);
                    stage = start("verify_hashes", progress.percent, &mut progress, &mut emit);
                    progress.completed += 1;
                    progress.downloaded += received;
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
                crate::backend::protected_fs::write(&path, data).map_err(|e| InstallError::cause(stage, e).path(&path))?;
                let mut content_receipt=vec![];
                for folder in ["mods","shaderpacks","resourcepacks"]{let dir=staging.join(folder);if !dir.is_dir(){continue;}for entry in fs::read_dir(&dir).map_err(|e|InstallError::cause(stage,e))?{check()?;let entry=entry.map_err(|e|InstallError::cause(stage,e))?;if !entry.file_type().map_err(|e|InstallError::cause(stage,e))?.is_file(){continue;}let path=entry.path();if path.extension().is_some_and(|e|e=="jar"||e=="zip"){let hash=crate::backend::download::hash_cancellable(&path,"sha512",job.map(|j|j.cancel.as_ref())).map_err(|e|InstallError::new(if e.code=="cancelled"{"cancelled"}else{stage},e.to_string()))?;content_receipt.push(serde_json::json!({"path":format!("{folder}/{}",entry.file_name().to_string_lossy()),"hash":hash}));}}}
                crate::backend::protected_fs::write(staging.join("pack-content-files.json"),serde_json::to_vec(&content_receipt).map_err(|e|InstallError::cause(stage,e))?).map_err(|e|InstallError::cause(stage,e))?;
                let manifest_path=staging.join("modrinth.index.json");
                crate::backend::protected_fs::write(&manifest_path,&raw).map_err(|e|InstallError::cause(stage,e).path(&manifest_path))?;
                check()?;succeeded(stage);
                stage = start("finalize", 98.0, &mut progress, &mut emit);
                crate::backend::protected_fs::rename(&staging, &root).map_err(|e| InstallError::cause(stage, e).path(&root))?;
                check()?;succeeded(stage);
                Ok(())
            }.await;
        if prepared.is_err() {
            if let Err(e) = crate::backend::protected_fs::remove_dir_all(&staging) {
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
    use std::io::{Write,Cursor};
    use zip::{write::SimpleFileOptions, ZipWriter};
    fn temporary(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("canary-{name}-{}", std::process::id()));
        let _ = crate::backend::protected_fs::remove_dir_all(&root);
        crate::backend::protected_fs::create_dir_all(&root).unwrap();
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
        // The former crate::backend::protected_fs::write(root, payload) path reproduces the reported post-download failure.
        assert!(crate::backend::protected_fs::write(&root, []).is_err());
        apply_overrides(&mut archive, &root, "overrides/", "apply_overrides").unwrap();
        apply_overrides(
            &mut archive,
            &root,
            "client-overrides/",
            "apply_client_overrides",
        )
        .unwrap();
        assert_eq!(
            crate::backend::protected_fs::read(root.join("config/options.txt")).unwrap(),
            b"client"
        );
        crate::backend::protected_fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn override_failure_preserves_stage_path_and_os_cause() {
        let root = temporary("override-error");
        crate::backend::protected_fs::write(root.join("config"), b"a file, not a directory").unwrap();
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
        crate::backend::protected_fs::remove_dir_all(root).unwrap();
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
        let before = crate::backend::protected_fs::read(path.join("canary-instance.json")).unwrap();
        let reused = tauri::async_runtime::block_on(install(
            "1KVo5zza",
            "9toQ7Bv7",
            "Fabulously Optimized",
            &root,
            |_| {},
        ))
        .unwrap();
        assert_eq!(reused, path);
        assert_eq!(crate::backend::protected_fs::read(path.join("canary-instance.json")).unwrap(), before);
        crate::backend::protected_fs::remove_dir_all(root).unwrap();
    }
}
