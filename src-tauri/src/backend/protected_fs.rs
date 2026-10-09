//! Handle-relative filesystem operations. Each parent component is opened
//! without following links; operations keep that parent handle through use.
//! Path strings are still validated by storage::safe_join at trust boundaries.
use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt};
use cap_std::fs::{Dir, OpenOptions};
use std::{ffi::OsString, fs::File, io::{self, Read, Write}, path::{Component, Path, PathBuf}};

fn denied() -> io::Error { io::Error::new(io::ErrorKind::PermissionDenied, "Unsafe filesystem path or link") }

pub fn directory(path: &Path, create: bool) -> io::Result<Dir> {
    let absolute = if path.is_absolute() { path.to_owned() } else { std::env::current_dir()?.join(path) };
    let mut root = PathBuf::new();
    let mut names = Vec::new();
    for part in absolute.components() {
        match part {
            Component::Prefix(prefix) => {
                #[cfg(windows)] if !matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)) { return Err(denied()); }
                root.push(prefix.as_os_str());
            }
            Component::RootDir => root.push(part.as_os_str()),
            Component::Normal(name) => names.push(name.to_owned()),
            _ => return Err(denied()),
        }
    }
    let mut dir = Dir::open_ambient_dir(root, cap_std::ambient_authority())?;
    for name in names {
        let next = match dir.open_dir_nofollow(&name) {
            Ok(next) => next,
            Err(error) if create && error.kind() == io::ErrorKind::NotFound => {
                match dir.create_dir(&name) { Ok(()) => {}, Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}, Err(error) => return Err(error) }
                dir.open_dir_nofollow(&name)?
            }
            Err(error) => return Err(error),
        };
        dir = next;
    }
    Ok(dir)
}

pub struct Parent { dir: Dir, name: OsString }
pub struct Partial { dir: Dir, name: OsString }
impl Drop for Partial { fn drop(&mut self) { let _=self.dir.remove_file(&self.name); } }
impl Parent {
    pub fn new(path: &Path, create: bool) -> io::Result<Self> {
        let name = path.file_name().ok_or_else(denied)?.to_owned();
        Ok(Self { dir: directory(path.parent().ok_or_else(denied)?, create)?, name })
    }
    pub fn read(&self) -> io::Result<File> {
        let file = self.dir.open_with(&self.name, OpenOptions::new().read(true).follow(FollowSymlinks::No))?;
        if !file.metadata()?.is_file() { return Err(denied()); }
        Ok(file.into_std())
    }
    pub fn temporary(&self) -> io::Result<(OsString, File)> {
        let name: OsString = format!(".canary-{}.part", uuid::Uuid::new_v4()).into();
        let file = self.dir.open_with(&name, OpenOptions::new().write(true).read(true).create_new(true).follow(FollowSymlinks::No))?;
        Ok((name, file.into_std()))
    }
    pub fn commit(&self, temporary: &std::ffi::OsStr) -> io::Result<()> {
        if self.dir.symlink_metadata(&self.name).is_ok_and(|m| !m.is_file() || m.file_type().is_symlink()) { return Err(denied()); }
        self.dir.rename(temporary, &self.dir, &self.name)
    }
    pub fn remove_temporary(&self, temporary: &std::ffi::OsStr) -> io::Result<()> { self.dir.remove_file(temporary) }
    // The cleanup handle survives dropped/cancelled async download futures.
    pub fn guard(&self, temporary:&std::ffi::OsStr)->io::Result<Partial> { Ok(Partial{dir:self.dir.try_clone()?,name:temporary.to_owned()}) }
}

pub fn open(path: impl AsRef<Path>) -> io::Result<File> { Parent::new(path.as_ref(), false)?.read() }
pub fn execution_guard(path:&Path)->io::Result<File>{
    let parent=Parent::new(path,false)?;let mut options=OpenOptions::new();options.read(true).follow(FollowSymlinks::No);
    #[cfg(windows)] {use cap_std::fs::OpenOptionsExt;options.share_mode(1);}
    let file=parent.dir.open_with(&parent.name,&options)?;if !file.metadata()?.is_file(){return Err(denied());}Ok(file.into_std())
}
pub fn read(path: impl AsRef<Path>) -> io::Result<Vec<u8>> {
    let mut file = open(path)?;
    // Metadata is bounded before allocation; game logs use dedicated tail reads.
    if file.metadata()?.len() > 64 * 1024 * 1024 { return Err(io::Error::new(io::ErrorKind::InvalidData, "Metadata file exceeds 64 MiB")); }
    let mut bytes = Vec::new(); Read::by_ref(&mut file).take(64 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 64 * 1024 * 1024 { return Err(io::Error::new(io::ErrorKind::InvalidData, "Metadata file exceeds 64 MiB")); }
    Ok(bytes)
}
pub fn read_to_string(path: impl AsRef<Path>) -> io::Result<String> {
    String::from_utf8(read(path)?).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid text file"))
}
pub fn write(path: impl AsRef<Path>, bytes: impl AsRef<[u8]>) -> io::Result<()> {
    let parent = Parent::new(path.as_ref(), true)?;
    let (temporary, mut file) = parent.temporary()?;
    let result = (|| { file.write_all(bytes.as_ref())?; file.sync_all()?; drop(file); parent.commit(&temporary) })();
    if result.is_err() { let _ = parent.remove_temporary(&temporary); }
    result
}
pub fn copy(source: impl AsRef<Path>, target: impl AsRef<Path>) -> io::Result<u64> {
    let mut source = open(source)?;
    let parent = Parent::new(target.as_ref(), true)?;
    let (temporary, mut file) = parent.temporary()?;
    let result = (|| { let bytes = io::copy(&mut source, &mut file)?; file.sync_all()?; drop(file); parent.commit(&temporary)?; Ok(bytes) })();
    if result.is_err() { let _ = parent.remove_temporary(&temporary); }
    result
}
pub fn create_new(path: impl AsRef<Path>) -> io::Result<File> {
    let parent = Parent::new(path.as_ref(), true)?;
    Ok(parent.dir.open_with(&parent.name, OpenOptions::new().write(true).create_new(true).follow(FollowSymlinks::No))?.into_std())
}
pub fn create(path: impl AsRef<Path>) -> io::Result<File> {
    let parent = Parent::new(path.as_ref(), true)?;
    // Inspect the opened object before truncation; a hard link cannot redirect
    // this write to an unrelated file. Full-file writes use atomic write/copy.
    let file = parent.dir.open_with(&parent.name, OpenOptions::new().write(true).create(true).follow(FollowSymlinks::No))?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 { return Err(denied()); }
    file.set_len(0)?; Ok(file.into_std())
}
pub fn append(path: impl AsRef<Path>) -> io::Result<File> {
    let parent = Parent::new(path.as_ref(), true)?;
    let file = parent.dir.open_with(&parent.name, OpenOptions::new().append(true).create(true).follow(FollowSymlinks::No))?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.nlink() != 1 { return Err(denied()); }
    Ok(file.into_std())
}
pub fn create_dir_all(path: impl AsRef<Path>) -> io::Result<()> { directory(path.as_ref(), true).map(|_| ()) }
pub fn create_dir(path: impl AsRef<Path>) -> io::Result<()> {
    let parent = Parent::new(path.as_ref(), false)?; parent.dir.create_dir(parent.name)
}
pub fn rename(source: impl AsRef<Path>, target: impl AsRef<Path>) -> io::Result<()> {
    let from = Parent::new(source.as_ref(), false)?;
    let to = Parent::new(target.as_ref(), false)?;
    if from.dir.symlink_metadata(&from.name)?.file_type().is_symlink() || to.dir.symlink_metadata(&to.name).is_ok_and(|m|m.file_type().is_symlink()) { return Err(denied()); }
    from.dir.rename(&from.name, &to.dir, &to.name)
}
pub fn remove_file(path: impl AsRef<Path>) -> io::Result<()> {
    let parent = Parent::new(path.as_ref(), false)?; parent.dir.remove_file(parent.name)
}
pub fn remove_dir_all(path: impl AsRef<Path>) -> io::Result<()> {
    directory(path.as_ref(), false)?.remove_open_dir_all()
}

#[cfg(test)] mod tests {
    use super::*;
    fn fixture() -> (PathBuf, super::super::storage::Staging) {
        let root = std::env::temp_dir().join(format!("canary-fs-security-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap(); (root.clone(), super::super::storage::Staging(root))
    }
    #[test] fn atomic_write_does_not_truncate_hard_link_target() {
        let (root,_cleanup) = fixture();
        let outside = root.join("outside"); let linked = root.join("linked");
        std::fs::write(&outside,b"sentinel").unwrap(); std::fs::hard_link(&outside,&linked).unwrap();
        write(&linked,b"replacement").unwrap();
        assert_eq!(std::fs::read(outside).unwrap(),b"sentinel");
        assert_eq!(std::fs::read(linked).unwrap(),b"replacement");
    }
    #[cfg(unix)] #[test] fn checked_parent_survives_swap_without_following_outside_link() {
        let (root,_cleanup) = fixture();
        std::fs::create_dir(root.join("destination")).unwrap(); std::fs::create_dir(root.join("outside")).unwrap();
        std::fs::write(root.join("outside/file"),b"sentinel").unwrap();
        let parent=Parent::new(&root.join("destination/file"),false).unwrap();
        std::fs::rename(root.join("destination"),root.join("held")).unwrap();
        std::os::unix::fs::symlink(root.join("outside"),root.join("destination")).unwrap();
        let (temporary,mut file)=parent.temporary().unwrap();file.write_all(b"safe").unwrap();drop(file);parent.commit(&temporary).unwrap();
        assert_eq!(std::fs::read(root.join("outside/file")).unwrap(),b"sentinel");
        assert!(write(root.join("destination/file"),b"attack").is_err());
        assert!(remove_dir_all(root.join("destination")).is_err());
    }
    #[cfg(windows)] #[test] fn junction_destination_cannot_escape() {
        let (root,_cleanup)=fixture();std::fs::create_dir(root.join("outside")).unwrap();
        std::fs::write(root.join("outside/file"),b"sentinel").unwrap();
        // cmd is used only to construct a disposable test junction, never for launch.
        let status=std::process::Command::new("cmd.exe").args(["/d","/c","mklink","/J"]).arg(root.join("destination")).arg(root.join("outside")).status().unwrap();
        assert!(status.success());assert!(write(root.join("destination/file"),b"attack").is_err());
        assert!(remove_dir_all(root.join("destination")).is_err());
        assert_eq!(std::fs::read(root.join("outside/file")).unwrap(),b"sentinel");
        std::fs::remove_dir(root.join("destination")).unwrap();
    }
}
