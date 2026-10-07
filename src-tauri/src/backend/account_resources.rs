//! Account dependencies share one synchronization point with deletion.
//! Guards are owned by the launch/removal future, so every exit path releases them.
use super::{accounts, model::*, Backend};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
pub struct Uses { launches: usize, removing: bool }
pub type Registry = Mutex<HashMap<String, Uses>>;
pub struct Guard<'a> { backend: &'a Backend, id: String, removal: bool }
impl Drop for Guard<'_> {
    fn drop(&mut self) {
        let mut resources = self.backend.account_resources.lock().unwrap();
        if let Some(entry) = resources.get_mut(&self.id) {
            if self.removal { entry.removing = false; } else { entry.launches -= 1; }
            if !entry.removing && entry.launches == 0 { resources.remove(&self.id); }
        }
    }
}
pub fn launch<'a>(backend: &'a Backend, instance: &Instance) -> Result<(Account, Guard<'a>)> {
    let mut resources = backend.account_resources.lock().unwrap();
    // Select while holding the same lock used to reserve deletion. No stale clone
    // can escape between selecting an account and protecting its dependency.
    let account = accounts::selected(backend, instance)?;
    let entry = resources.entry(account.id.clone()).or_default();
    if entry.removing { return Err(BackendError::new("account_removing", "The selected account is being removed")); }
    entry.launches += 1;
    let guard = Guard { backend, id: account.id.clone(), removal: false };
    Ok((account, guard))
}
pub fn removal<'a>(backend: &'a Backend, id: &str) -> Result<Guard<'a>> {
    let mut resources = backend.account_resources.lock().unwrap();
    if backend.processes.lock().unwrap().values().any(|p| p.account == id) {
        return Err(BackendError::new("account_in_use_by_game", "This account is used by running Minecraft"));
    }
    let entry = resources.entry(id.into()).or_default();
    if entry.launches > 0 { return Err(BackendError::new("account_in_use_by_launch", "This account is used by a launch in progress")); }
    if entry.removing { return Err(BackendError::new("account_removing", "This account is already being removed")); }
    entry.removing = true;
    Ok(Guard { backend, id: id.into(), removal: true })
}

#[cfg(test)]mod tests{
    use super::*;use std::sync::{Arc,Barrier};
    fn backend()->(Arc<Backend>,super::super::storage::Staging){let root=std::env::temp_dir().join(format!("canary-account-resources-{}",uuid::Uuid::new_v4()));(Arc::new(Backend::with_root(root.clone()).unwrap()),super::super::storage::Staging(root))}
    #[test]fn unrelated_install_and_download_allow_delete_and_clear_references(){
        let (b,_cleanup)=backend();let a=accounts::local(&b,"FirstPlayer").unwrap();let other=accounts::local(&b,"OtherPlayer").unwrap();
        let id="pack";let dir=b.instance_path(id).unwrap();std::fs::create_dir_all(dir.join("saves")).unwrap();std::fs::write(dir.join("saves/world.dat"),"world").unwrap();
        let i=Instance{id:id.into(),overrides:Overrides{account:Some(other.id.clone()),..Overrides::default()},..Instance::default()};b.save_instance(&i).unwrap();
        let _install=b.lease("unrelated-install").unwrap();let _download=b.lease("unrelated-download").unwrap();
        accounts::remove(&b,&other.id).unwrap();
        assert_eq!(b.settings().active_account.as_deref(),Some(a.id.as_str()));assert!(b.instance(id).unwrap().overrides.account.is_none());
        b.save_instance(&i).unwrap();assert!(b.instance(id).unwrap().overrides.account.is_none());
        assert_eq!(std::fs::read_to_string(dir.join("saves/world.dat")).unwrap(),"world");
        assert_eq!(accounts::selected(&b,&i).unwrap().id,a.id);
    }
    #[test]fn same_account_launch_blocks_other_account_does_not(){
        let (b,_cleanup)=backend();let a=accounts::local(&b,"FirstPlayer").unwrap();let other=accounts::local(&b,"OtherPlayer").unwrap();
        let i=Instance{overrides:Overrides{account:Some(a.id.clone()),..Overrides::default()},..Instance::default()};
        let (_,guard)=launch(&b,&i).unwrap();assert_eq!(accounts::remove(&b,&a.id).unwrap_err().code,"account_in_use_by_launch");
        accounts::remove(&b,&other.id).unwrap();drop(guard);accounts::remove(&b,&a.id).unwrap();assert!(b.account_resources.lock().unwrap().is_empty());
        assert!(b.settings().active_account.is_none());
    }
    #[test]fn launch_delete_race_cannot_expose_removed_account(){
        for _ in 0..20{
            let (b,_cleanup)=backend();let a=accounts::local(&b,"FirstPlayer").unwrap();let barrier=Arc::new(Barrier::new(2));let held=Arc::new(Barrier::new(2));
            let i=Instance{overrides:Overrides{account:Some(a.id.clone()),..Overrides::default()},..Instance::default()};
            std::thread::scope(|scope|{
                let b=&b;let a=&a;let barrier1=barrier.clone();let held1=held.clone();
                let launch=scope.spawn(move||{barrier1.wait();let result=super::launch(b,&i);held1.wait();let success=result.is_ok();drop(result);success});
                let remove=scope.spawn(move||{barrier.wait();let result=accounts::remove(b,&a.id);held.wait();result.is_ok()});
                let launched=launch.join().unwrap();let removed=remove.join().unwrap();assert!(!(launched&&removed));
            });
            assert!(b.account_resources.lock().unwrap().is_empty());
        }
    }
    #[tokio::test]async fn game_dependency_is_account_specific(){
        let (b,_cleanup)=backend();let a=accounts::local(&b,"FirstPlayer").unwrap();let other=accounts::local(&b,"OtherPlayer").unwrap();
        #[cfg(windows)]let mut command={let mut c=tokio::process::Command::new("powershell.exe");c.args(["-NoProfile","-Command","Start-Sleep -Seconds 30"]);c.creation_flags(0x08000000);c};
        #[cfg(not(windows))]let mut command={let mut c=tokio::process::Command::new("/bin/sleep");c.arg("30");c};
        let process=command.kill_on_drop(true).spawn().unwrap();let pid=process.id().unwrap();let child=Arc::new(tokio::sync::Mutex::new(process));
        b.processes.lock().unwrap().insert("instance".into(),super::super::process::Running{session:None,pid,account:a.id.clone(),child:child.clone(),stopping:Arc::new(std::sync::atomic::AtomicBool::new(false))});
        assert_eq!(accounts::remove(&b,&a.id).unwrap_err().code,"account_in_use_by_game");accounts::remove(&b,&other.id).unwrap();
        child.lock().await.kill().await.unwrap();b.processes.lock().unwrap().clear();accounts::remove(&b,&a.id).unwrap();
    }
}
