//! Local history requires evidence of joining, not just a connection attempt.
use super::{Backend, model::*, storage};
use std::io::Read;

#[derive(Default)] pub struct Tracker { pending: Option<String> }
impl Tracker {
    pub fn line(&mut self, line: &str, timestamp: u64) -> Option<LastServer> {
        let message = line.split_once("]: ").map_or(line, |(_, message)| message);
        if let Some(connection) = message.strip_prefix("Connecting to ") {
            self.pending = address(connection); return None;
        }
        if ["Failed to connect", "Couldn't connect", "Cannot connect", "UnknownHostException", "ConnectException", "Starting integrated minecraft server"].iter().any(|s| message.contains(s)) {
            self.pending = None; return None;
        }
        // Server chat covers legacy clients; advancement sync covers modern ones.
        if message.starts_with("[CHAT]") || (message.starts_with("Loaded ") && message.ends_with(" advancements")) || message.contains(" logged in with entity id ") {
            return self.pending.take().map(|address| LastServer { address, joined_at: timestamp });
        }
        None
    }
}
fn address(value: &str) -> Option<String> {
    let (host, port) = value.trim().rsplit_once(", ")?;
    let port = port.parse::<u16>().ok().filter(|p| *p > 0)?;
    let host = host.trim().trim_start_matches('[').trim_end_matches(']');
    if host.is_empty() || host.len() > 253 || !host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '_')) { return None; }
    let host = if host.contains(':') { format!("[{host}]") } else { host.to_owned() };
    Some(if port == 25565 { host } else { format!("{host}:{port}") })
}
pub fn record(backend: &Backend, id: &str, server: LastServer) -> Result<()> {
    let path=backend.instance_path(id)?.join("instance.json");
    // Change only history under the same lock as save_instance: output can
    // arrive after the process exit monitor has saved its final status.
    let mut store=backend.store.lock().unwrap();
    let mut instance:Instance=serde_json::from_slice(&std::fs::read(&path)?)?;
    if instance.last_server.as_ref().is_some_and(|last|last.joined_at>server.joined_at){return Ok(());}
    instance.last_server=Some(server.clone());storage::write_json(&path,&instance)?;
    if let Some(cached)=store.instance_catalog.iter_mut().find(|i|i.id==id){cached.last_server=Some(server);}
    storage::write_json(&backend.root.join("settings.json"),&*store)
}
pub fn restore(backend: &Backend, instance: &mut Instance) {
    if instance.last_server.is_some() || instance.status == "unavailable" { return; }
    if !backend.server_history_checked.lock().unwrap().insert(instance.id.clone()) { return; }
    let Ok(entries) = std::fs::read_dir(std::path::Path::new(&instance.directory).join("logs")) else { return; };
    let mut files = entries.flatten().filter(|entry| {
        let name = entry.file_name().to_string_lossy().to_string();
        (name.starts_with("canary-") || name == "latest.log") && name.ends_with(".log") && entry.file_type().is_ok_and(|kind| kind.is_file())
    }).filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path()))).collect::<Vec<_>>();
    files.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    for (modified, path) in files.into_iter().take(8) {
        let Ok(file) = std::fs::File::open(path) else { continue; };
        let timestamp = modified.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs().min(now());
        let mut bytes = Vec::new();if file.take(5 * 1024 * 1024).read_to_end(&mut bytes).is_err() { continue; }
        let mut tracker = Tracker::default();let mut latest = None;
        for line in String::from_utf8_lossy(&bytes).lines() { if let Some(server) = tracker.line(line, timestamp) { latest = Some(server); } }
        if let Some(server) = latest { if record(backend, &instance.id, server.clone()).is_ok() { instance.last_server = Some(server); } break; }
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn only_confirmed_connections_replace_history() {
        let mut tracker = Tracker::default();
        assert!(tracker.line("[20:01:00] [Render thread/INFO]: Connecting to play.example.org, 25565", 1).is_none());
        tracker.line("Failed to connect to the server", 2);
        assert!(tracker.line("[CHAT] unrelated local message", 3).is_none());
        tracker.line("Connecting to play.example.org, 25566", 4);
        let server = tracker.line("[20:02:00] [Render thread/INFO]: Loaded 24 advancements", 5).unwrap();
        assert_eq!(server.address, "play.example.org:25566");assert_eq!(server.joined_at, 5);
        tracker.line("Connecting to [::1], 25565", 6);
        assert_eq!(tracker.line("[CHAT] Welcome", 7).unwrap().address, "[::1]");
        tracker.line("Connecting to bad.example.org, 25565", 8);tracker.line("Starting integrated minecraft server version 1.8.9", 9);
        assert!(tracker.line("Player logged in with entity id 1", 10).is_none());
        assert!(address("https://unsafe.example/token, 25565").is_none());
    }
    #[test] fn history_survives_restart_and_a_stale_exit_snapshot() {
        let root = std::env::temp_dir().join(format!("canary-server-{}", uuid::Uuid::new_v4()));
        let _cleanup = super::super::storage::Staging(root.clone());let backend = Backend::with_root(root.clone()).unwrap();
        let dir = backend.instance_path("world").unwrap();std::fs::create_dir_all(dir.join("logs")).unwrap();
        let mut instance = Instance { id:"world".into(),name:"My pack".into(),minecraft:"1.8.9".into(),directory:dir.to_string_lossy().into(),..Instance::default() };
        backend.save_instance(&instance).unwrap();
        std::fs::write(dir.join("logs/canary-1.log"), "Connecting to play.example.org, 25565\n[CHAT] Welcome\nConnecting to broken.example.org, 25565\nFailed to connect to the server\n").unwrap();
        restore(&backend, &mut instance);assert_eq!(instance.last_server.as_ref().unwrap().address, "play.example.org");
        let stale = instance.clone();
        record(&backend, "world", LastServer { address:"same-second.example.org".into(),joined_at:stale.last_server.as_ref().unwrap().joined_at }).unwrap();
        backend.save_instance(&stale).unwrap();assert_eq!(backend.instance("world").unwrap().last_server.unwrap().address,"same-second.example.org");
        record(&backend, "world", LastServer { address:"new.example.org".into(),joined_at:u64::MAX }).unwrap();
        backend.save_instance(&stale).unwrap();drop(backend);
        assert_eq!(Backend::with_root(root).unwrap().instance("world").unwrap().last_server.unwrap().address, "new.example.org");
    }
}
