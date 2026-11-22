//! One best-effort Rich Presence service. Tasks and real process records remain
//! authoritative; the renderer supplies only its view and privacy preferences.
mod ipc;
#[cfg(test)]
mod tests;

use super::{
    activity::{Task, TaskKind, TaskStatus},
    model::Instance,
    Backend,
};
use discord_rich_presence::activity::{Activity, Assets, Button, Timestamps};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, Weak,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Notify;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub application_id: String,
    pub website: Option<String>,
    pub download: Option<String>,
    pub large_image: String,
    pub small_images: HashMap<String, String>,
    pub confirmed_assets: Vec<String>,
}
impl Default for Configuration {
    fn default() -> Self {
        // A malformed optional integration config must never prevent startup.
        serde_json::from_str(include_str!("../../discord-presence.json")).unwrap_or_else(|_| Self {
            application_id: String::new(),
            website: None,
            download: None,
            large_image: String::new(),
            small_images: HashMap::new(),
            confirmed_assets: vec![],
        })
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewKind {
    #[default]
    Idle,
    Home,
    Discover,
    Project,
    Library,
    Settings,
    Error,
}
#[derive(Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    Ru,
    #[default]
    En,
}
#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct View {
    pub kind: ViewKind,
    pub locale: Locale,
    pub project_name: String,
    pub provider: String,
    pub category: String,
}
impl Default for View {
    fn default() -> Self {
        Self {
            kind: ViewKind::Idle,
            locale: Locale::En,
            project_name: String::new(),
            provider: String::new(),
            category: String::new(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub enabled: bool,
    pub instance_names: bool,
    pub project_names: bool,
    pub downloads: bool,
    pub current_page: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            enabled: true,
            instance_names: true,
            project_names: true,
            downloads: true,
            current_page: true,
        }
    }
}
#[derive(Clone, Default)]
pub struct Input {
    pub view: View,
    pub preferences: Preferences,
}

/// Stored on the existing Running record only after an OS process was spawned.
#[derive(Clone, Default)]
pub struct Session {
    pub instance_id: String,
    pub name: String,
    pub minecraft: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub started_at: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Idle,
    Home,
    Discover,
    ViewingProject,
    Library,
    Settings,
    Downloading,
    Installing,
    Updating,
    Repairing,
    Launching,
    Playing,
    Error,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Presence {
    pub kind: Kind,
    pub payload: Value,
    pub identity: String,
}

fn text(value: &str, limit: usize) -> String {
    let cleaned = value
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>();
    let cleaned = cleaned.trim();
    // Discord limits are bytes on some clients. Never split a UTF-8 code point.
    if cleaned.len() <= limit {
        return cleaned.into();
    }
    let mut end = limit.saturating_sub(3).min(cleaned.len());
    while !cleaned.is_char_boundary(end) {
        end = end.saturating_sub(1);
    }
    format!("{}…", &cleaned[..end])
}
fn provider(value: &str) -> &str {
    match value {
        "modrinth" => "Modrinth",
        "curseforge" => "CurseForge",
        _ => "",
    }
}
fn join(parts: impl IntoIterator<Item = String>) -> String {
    text(
        &parts
            .into_iter()
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
        128,
    )
}
fn public_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    let host = url.host_str().unwrap_or_default();
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && !host.is_empty()
        && host != "localhost"
        && host != "github.com"
        && !host.ends_with(".local")
        && !host.parse::<std::net::IpAddr>().is_ok()
        && value.len() <= 512
}

/// Pure, testable mapping. No account identifiers, paths, filenames or errors
/// are accepted into a Discord payload.
pub fn map(
    input: &Input,
    sessions: &[Session],
    tasks: &[Task],
    instances: &[Instance],
    config: &Configuration,
) -> Option<Presence> {
    let p = &input.preferences;
    if !p.enabled {
        return None;
    }
    let ru = input.view.locale == Locale::Ru;
    let tr = |r: &str, e: &str| if ru { r.to_owned() } else { e.to_owned() };
    let mut started = None;
    let mut small = None;
    let mut identity = String::new();
    let (kind, details, state) = if let Some(s) = sessions
        .iter()
        .max_by_key(|s| (s.started_at, &s.instance_id))
    {
        started = Some(s.started_at);
        small = Some((
            s.loader.as_str(),
            join([
                s.loader.clone(),
                s.loader_version.clone().unwrap_or_default(),
            ]),
        ));
        identity = s.instance_id.clone();
        let version = if s.minecraft.is_empty() {
            "Minecraft".into()
        } else {
            format!("Minecraft {}", text(&s.minecraft, 40))
        };
        (
            Kind::Playing,
            if p.instance_names {
                tr("Играет через Canary", "Playing through Canary")
            } else {
                tr("Играет в Minecraft", "Playing Minecraft")
            },
            join([
                if p.instance_names {
                    text(&s.name, 64)
                } else {
                    String::new()
                },
                version,
            ]),
        )
    } else if let Some(task) = tasks
        .iter()
        .filter(|t| {
            t.status == TaskStatus::Running && (p.downloads || matches!(t.kind, TaskKind::Launch))
        })
        .max_by_key(|t| (matches!(t.kind, TaskKind::Launch), t.started_at, &t.id))
    {
        identity = task.id.clone();
        let instance = task
            .instance_id
            .as_ref()
            .and_then(|id| instances.iter().find(|i| &i.id == id));
        let name = if matches!(task.kind, TaskKind::Launch) {
            if p.instance_names {
                instance
                    .map(|i| text(&i.name, 64))
                    .unwrap_or_else(|| text(&task.title, 64))
            } else {
                String::new()
            }
        } else if p.project_names && p.instance_names {
            text(&task.title, 64)
        } else {
            String::new()
        };
        small = instance.map(|i| (i.provider.as_str(), provider(&i.provider).into()));
        let (kind, verb) = match task.kind {
            TaskKind::Launch => (
                Kind::Launching,
                tr("Запускает Minecraft", "Launching Minecraft"),
            ),
            TaskKind::Update => (Kind::Updating, tr("Обновляет", "Updating")),
            TaskKind::Repair => (Kind::Repairing, tr("Восстанавливает", "Repairing")),
            TaskKind::Download => (Kind::Downloading, tr("Загружает", "Downloading")),
            TaskKind::Install
                if matches!(
                    task.stage.as_str(),
                    "downloads" | "libraries" | "assets" | "java_download" | "content_download"
                ) =>
            {
                (Kind::Downloading, tr("Загружает", "Downloading"))
            }
            TaskKind::Install => (Kind::Installing, tr("Устанавливает", "Installing")),
        };
        let details = if kind == Kind::Launching {
            verb
        } else {
            format!(
                "{verb} {}",
                if name.is_empty() {
                    tr("контент", "content")
                } else {
                    name.clone()
                }
            )
        };
        let state = if kind == Kind::Launching {
            name
        } else {
            let percent = if task.percent.is_finite() {
                task.percent.clamp(0., 100.).round() as u32
            } else {
                0
            };
            join([
                format!("{percent}%"),
                if task.total > 0 {
                    format!(
                        "{} / {} {}",
                        task.completed.min(task.total),
                        task.total,
                        tr("файлов", "files")
                    )
                } else {
                    String::new()
                },
            ])
        };
        (kind, details, state)
    } else if p.current_page {
        let v = &input.view;
        let source = provider(&v.provider);
        small = Some((v.provider.as_str(), source.into()));
        match v.kind {
            ViewKind::Home => (
                Kind::Home,
                tr("На главной", "On the home page"),
                String::new(),
            ),
            ViewKind::Discover => (
                Kind::Discover,
                tr("Просматривает проекты", "Browsing projects"),
                String::new(),
            ),
            ViewKind::Project => (
                Kind::ViewingProject,
                if p.project_names && !v.project_name.is_empty() {
                    format!("{} {}", tr("Смотрит", "Viewing"), text(&v.project_name, 88))
                } else {
                    tr("Смотрит проект", "Viewing a project")
                },
                String::new(),
            ),
            ViewKind::Library => (
                Kind::Library,
                tr("Управляет экземплярами", "Managing instances"),
                String::new(),
            ),
            ViewKind::Settings => (
                Kind::Settings,
                tr("Настраивает Canary", "Configuring Canary"),
                String::new(),
            ),
            ViewKind::Error => (Kind::Error, tr("В Canary", "In Canary"), String::new()),
            ViewKind::Idle => (Kind::Idle, tr("В Canary", "In Canary"), String::new()),
        }
    } else {
        (Kind::Idle, tr("В Canary", "In Canary"), String::new())
    };
    let mut activity = Activity::new().details(text(&details, 128));
    if !state.is_empty() {
        activity = activity.state(text(&state, 128));
    }
    if let Some(start) = started {
        activity = activity.timestamps(Timestamps::new().start(start.min(i64::MAX as u64) as i64));
    }
    let confirmed = |key: &str| config.confirmed_assets.iter().any(|k| k == key);
    // Omit unconfirmed image keys: Discord uses the application's icon instead.
    let mut assets = Assets::new();
    let mut has_assets = false;
    if confirmed(&config.large_image) {
        assets = assets
            .large_image(config.large_image.clone())
            .large_text("Canary — Minecraft Launcher");
        has_assets = true;
    }
    if let Some((context, label)) = small {
        if let Some(key) = config
            .small_images
            .get(context)
            .filter(|key| confirmed(key))
        {
            assets = assets
                .small_image(key.clone())
                .small_text(text(&label, 128));
            has_assets = true;
        }
    }
    if has_assets {
        activity = activity.assets(assets);
    }
    let mut buttons = vec![];
    if let Some(url) = config.website.as_ref().filter(|u| public_url(u)) {
        buttons.push(Button::new(
            tr("Сайт Canary", "Canary website"),
            url.clone(),
        ));
    }
    if let Some(url) = config.download.as_ref().filter(|u| public_url(u)) {
        buttons.push(Button::new(
            tr("Скачать Canary", "Download Canary"),
            url.clone(),
        ));
    }
    if !buttons.is_empty() {
        activity = activity.buttons(buttons);
    }
    let payload = serde_json::to_value(activity).ok()?;
    Some(Presence {
        kind,
        payload,
        identity,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Disabled,
    Unavailable,
    Connected,
}
pub struct Manager {
    input: Mutex<Option<Input>>,
    status: Mutex<Status>,
    wake: Notify,
    privacy: Notify,
    shutdown: AtomicBool,
}
impl Default for Manager {
    fn default() -> Self {
        Self {
            input: Mutex::new(None),
            status: Mutex::new(Status::Disabled),
            wake: Notify::new(),
            privacy: Notify::new(),
            shutdown: AtomicBool::new(false),
        }
    }
}
impl Manager {
    pub fn update(&self, mut input: Input) {
        input.view.project_name = text(&input.view.project_name, 256);
        input.view.provider = text(&input.view.provider, 24);
        input.view.category = text(&input.view.category, 24);
        if let Ok(mut current) = self.input.lock() {
            let changed = current
                .as_ref()
                .is_some_and(|old| old.preferences != input.preferences);
            *current = Some(input);
            if changed {
                self.privacy.notify_one();
            }
            self.wake.notify_one();
        }
    }
    pub fn changed(&self) {
        self.wake.notify_one();
    }
    pub fn status(&self) -> Status {
        self.status
            .lock()
            .map(|s| *s)
            .unwrap_or(Status::Unavailable)
    }
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Release);
        self.privacy.notify_one();
        self.wake.notify_one();
    }
    fn set_status(&self, status: Status, notify: &impl Fn(Status)) {
        if let Ok(mut current) = self.status.lock() {
            if *current != status {
                *current = status;
                notify(status);
                eprintln!("[discord] {:?}", status);
            }
        }
    }
    pub fn start(backend: &Arc<Backend>, app: AppHandle) {
        let weak = Arc::downgrade(backend);
        let manager = backend.discord.clone();
        tauri::async_runtime::spawn(async move {
            manager
                .run(
                    weak,
                    Configuration::default(),
                    |id| async move { ipc::Connection::connect(&id).await },
                    move |status| {
                        let _ = app.emit("discord-presence-status", status);
                    },
                )
                .await;
        });
    }
    async fn run<C, F, N>(
        &self,
        backend: Weak<Backend>,
        mut config: Configuration,
        connect: C,
        notify: N,
    ) where
        C: Fn(String) -> F,
        F: std::future::Future<Output = std::io::Result<ipc::Connection>>,
        N: Fn(Status),
    {
        eprintln!("[discord] initialized");
        if cfg!(debug_assertions) {
            if let Ok(id) = std::env::var("CANARY_DISCORD_CLIENT_ID") {
                if id.parse::<u64>().is_ok_and(|id| id > 0) {
                    config.application_id = id;
                }
            }
        }
        let mut connection: Option<ipc::Connection> = None;
        let mut schedule = Schedule::default();
        let mut retry = Duration::from_secs(2);
        let mut next_connect = Instant::now();
        let mut next_probe = Instant::now();
        let mut tick = tokio::time::interval(Duration::from_millis(250));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {_ = self.wake.notified()=>{}, _ = tick.tick()=>{}}
            if self.shutdown.load(Ordering::Acquire) {
                if let Some(mut c) = connection.take() {
                    let _ = c.clear().await;
                }
                break;
            }
            let Some(b) = backend.upgrade() else { break };
            let input = self.input.lock().ok().and_then(|i| i.clone());
            let Some(input) = input else { continue };
            if !input.preferences.enabled {
                if let Some(mut c) = connection.take() {
                    let _ = c.clear().await;
                }
                schedule = Schedule::default();
                next_connect = Instant::now();
                retry = Duration::from_secs(2);
                self.set_status(Status::Disabled, &notify);
                continue;
            }
            let sessions = b
                .processes
                .lock()
                .map(|p| {
                    p.values()
                        .filter_map(|p| p.session.clone())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let tasks = b
                .tasks
                .lock()
                .map(|t| t.values().map(|r| r.task.clone()).collect::<Vec<_>>())
                .unwrap_or_default();
            let instances = b
                .store
                .lock()
                .map(|s| s.instance_catalog.clone())
                .unwrap_or_default();
            drop(b);
            let presence = map(&input, &sessions, &tasks, &instances, &config);
            if connection.is_none() {
                if Instant::now() < next_connect {
                    continue;
                }
                self.set_status(Status::Unavailable, &notify);
                let attempt = tokio::select! {
                    _ = self.privacy.notified()=>{continue;},
                    result=tokio::time::timeout(Duration::from_secs(3),connect(config.application_id.clone()))=>result.unwrap_or_else(|_|Err(std::io::Error::from(std::io::ErrorKind::TimedOut))),
                };
                match attempt {
                    Ok(c) => {
                        connection = Some(c);
                        schedule = Schedule::default();
                        retry = Duration::from_secs(2);
                        next_probe = Instant::now() + Duration::from_secs(15);
                        self.set_status(Status::Connected, &notify);
                    }
                    Err(_) => {
                        next_connect = Instant::now() + retry;
                        retry = (retry * 2).min(Duration::from_secs(30));
                        continue;
                    }
                }
            }
            // Re-read privacy after a possibly slow handshake, before publishing.
            let still_current = self
                .input
                .lock()
                .ok()
                .and_then(|i| i.as_ref().map(|i| i.preferences == input.preferences));
            if still_current != Some(true) {
                continue;
            }
            let Some(c) = connection.as_mut() else {
                continue;
            };
            let result = if let Some(p) = presence.filter(|p| schedule.due(p, Instant::now())) {
                let result = tokio::select! {
                    _ = self.privacy.notified()=>{
                        // Cancelling a frame read can leave it partial. Drop the
                        // pipe immediately: Discord clears this client, and no
                        // stale private payload is replayed on the next socket.
                        connection=None;schedule=Schedule::default();next_connect=Instant::now();continue;
                    },
                    result=c.publish(&p.payload)=>result,
                };
                if result.is_ok() {
                    schedule.sent(p, Instant::now());
                }
                result
            } else if Instant::now() >= next_probe {
                next_probe = Instant::now() + Duration::from_secs(15);
                tokio::select! {
                _ = self.privacy.notified()=>{connection=None;schedule=Schedule::default();next_connect=Instant::now();continue;},result=c.probe()=>result}
            } else {
                continue;
            };
            if result.is_err() {
                eprintln!("[discord] update failed; reconnect scheduled");
                connection = None;
                schedule = Schedule::default();
                next_connect = Instant::now() + retry;
                retry = (retry * 2).min(Duration::from_secs(30));
                self.set_status(Status::Unavailable, &notify);
            }
        }
        self.set_status(Status::Disabled, &notify);
    }
}

/// Coalesce progress (5s) and navigation (1s), but never delay privacy removal,
/// real game transitions, or a terminal task returning to launcher navigation.
#[derive(Default)]
struct Schedule {
    last: Option<(Presence, Instant)>,
}
impl Schedule {
    fn due(&self, next: &Presence, now: Instant) -> bool {
        let Some((last, sent)) = &self.last else {
            return true;
        };
        if last == next {
            return false;
        }
        if last.kind == Kind::Playing
            || next.kind == Kind::Playing
            || last.kind == Kind::Launching
            || next.kind == Kind::Launching
            || last.identity != next.identity
        {
            return true;
        }
        let delay = if matches!(
            next.kind,
            Kind::Installing | Kind::Downloading | Kind::Updating | Kind::Repairing
        ) {
            Duration::from_secs(5)
        } else {
            Duration::from_secs(1)
        };
        now.duration_since(*sent) >= delay
    }
    fn sent(&mut self, presence: Presence, now: Instant) {
        self.last = Some((presence, now));
    }
}

#[tauri::command]
pub fn discord_presence_context(
    backend: State<'_, Arc<Backend>>,
    view: View,
    preferences: Preferences,
) -> Status {
    backend.discord.update(Input { view, preferences });
    backend.discord.status()
}
