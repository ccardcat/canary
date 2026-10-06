use super::super::model::BackendError;
#[cfg(unix)]
use super::super::model::now;
use super::*;

fn input() -> Input {
    Input {
        view: View {
            kind: ViewKind::Home,
            ..View::default()
        },
        ..Input::default()
    }
}
fn session() -> Session {
    Session {
        instance_id: "game".into(),
        name: "Fabulously Optimized".into(),
        minecraft: "1.21.1".into(),
        loader: "fabric".into(),
        loader_version: Some("0.16.9".into()),
        started_at: 100,
        ..Session::default()
    }
}
fn task() -> Task {
    Task {
        revision: 1,
        id: "task".into(),
        operation_id: "instance".into(),
        kind: TaskKind::Install,
        title: "Better MC".into(),
        instance_id: None,
        status: TaskStatus::Running,
        stage: "prepare".into(),
        started_at: 100,
        updated_at: 100,
        cancellable: true,
        cancel_requested: false,
        completed: 43,
        total: 97,
        downloaded: 0,
        bytes_total: 0,
        percent: 67.382819,
        speed: 0,
        current_file: "secret/private/technical.jar".into(),
        error: None,
    }
}
fn mapped(i: &Input, g: &[Session], t: &[Task]) -> Presence {
    map(i, g, t, &[], &Configuration::default()).unwrap()
}

#[test]
fn home_navigation_project_and_locale() {
    let mut i = input();
    assert_eq!(mapped(&i, &[], &[]).payload["details"], "On the home page");
    i.view.locale = Locale::Ru;
    assert_eq!(mapped(&i, &[], &[]).payload["details"], "На главной");
    for (kind, expected) in [
        (ViewKind::Discover, "Просматривает проекты"),
        (ViewKind::Library, "Управляет экземплярами"),
        (ViewKind::Settings, "Настраивает Canary"),
    ] {
        i.view.kind = kind;
        assert_eq!(mapped(&i, &[], &[]).payload["details"], expected);
    }
    i.view.kind = ViewKind::Project;
    i.view.project_name = "Better MC".into();
    i.view.provider = "modrinth".into();
    i.view.category = "modpack".into();
    assert_eq!(mapped(&i, &[], &[]).payload["details"], "Смотрит Better MC");
    assert!(mapped(&i, &[], &[]).payload.get("state").is_none());
    i.preferences.project_names = false;
    assert_eq!(mapped(&i, &[], &[]).payload["details"], "Смотрит проект");
    i.preferences.current_page = false;
    assert_eq!(mapped(&i, &[], &[]).kind, Kind::Idle);
}
#[test]
fn playing_has_priority_stable_session_timer_and_privacy() {
    let mut i = input();
    let mut a = session();
    let mut t = task();
    t.kind = TaskKind::Launch;
    let p = mapped(&i, &[a.clone()], &[t.clone()]);
    assert_eq!(p.kind, Kind::Playing);
    assert_eq!(
        p.payload["state"],
        "Fabulously Optimized · Minecraft 1.21.1"
    );
    assert_eq!(p.payload["timestamps"]["start"], 100);
    i.view.kind = ViewKind::Settings;
    assert_eq!(mapped(&i, &[a.clone()], &[t.clone()]).payload, p.payload);
    i.preferences.instance_names = false;
    let p = mapped(&i, &[a.clone()], &[]);
    assert_eq!(p.payload["details"], "Playing Minecraft");
    assert_eq!(p.payload["state"], "Minecraft 1.21.1");
    assert!(!p.payload.to_string().contains(&a.name));
    a.started_at = 200;
    assert_eq!(
        mapped(&i, &[a.clone()], &[]).payload["timestamps"]["start"],
        200
    );
    let mut second = a.clone();
    second.started_at = 300;
    second.instance_id = "second".into();
    assert_eq!(mapped(&i, &[a, second], &[]).identity, "second");
    assert_eq!(mapped(&i, &[], &[]).kind, Kind::Settings);
}

#[test]
fn clean_copy_in_both_locales_preserves_visual_context_and_launch_privacy() {
    let mut config = Configuration::default();
    config.confirmed_assets = vec![
        "canary_logo".into(),
        "modrinth".into(),
        "curseforge".into(),
    ];
    for (locale, discover, launch) in [
        (Locale::Ru, "Просматривает проекты", "Запускает Minecraft"),
        (Locale::En, "Browsing projects", "Launching Minecraft"),
    ] {
        let mut i = input();
        i.view.locale = locale;
        for source in ["modrinth", "curseforge"] {
            i.view.provider = source.into();
            i.view.category = "modpack".into();
            i.view.project_name = "Better MC".into();
            for kind in [
                ViewKind::Home,
                ViewKind::Discover,
                ViewKind::Project,
                ViewKind::Library,
                ViewKind::Settings,
            ] {
                i.view.kind = kind;
                let p = map(&i, &[], &[], &[], &config).unwrap().payload;
                assert!(p.get("state").is_none());
                assert!(!p["details"].as_str().unwrap().contains("Modrinth"));
                assert!(!p["details"].as_str().unwrap().contains("CurseForge"));
                if kind == ViewKind::Discover {
                    assert_eq!(p["details"], discover);
                }
                assert_eq!(p["assets"]["large_image"], "canary_logo");
                assert_eq!(p["assets"]["small_image"], source);
                assert_eq!(p["buttons"].as_array().unwrap().len(), 1);
            }
        }
        let mut t = task();
        t.kind = TaskKind::Launch;
        let p = mapped(&i, &[], &[t.clone()]).payload;
        assert_eq!(p["details"], launch);
        assert_eq!(p["state"], "Better MC");
        i.preferences.instance_names = false;
        assert!(mapped(&i, &[], &[t]).payload.get("state").is_none());
    }
}
#[test]
fn install_progress_privacy_and_terminal_cleanup() {
    let mut i = input();
    let mut t = task();
    let p = mapped(&i, &[], &[t.clone()]);
    assert_eq!(p.kind, Kind::Installing);
    assert_eq!(p.payload["details"], "Installing Better MC");
    assert_eq!(p.payload["state"], "67% · 43 / 97 files");
    assert!(!p.payload.to_string().contains("technical.jar"));
    for (kind, expected) in [
        (TaskKind::Download, Kind::Downloading),
        (TaskKind::Update, Kind::Updating),
        (TaskKind::Repair, Kind::Repairing),
        (TaskKind::Launch, Kind::Launching),
    ] {
        t.kind = kind;
        assert_eq!(mapped(&i, &[], &[t.clone()]).kind, expected);
    }
    i.preferences.instance_names = false;
    assert!(!mapped(&i, &[], &[t.clone()])
        .payload
        .to_string()
        .contains("Better MC"));
    t.kind = TaskKind::Install;
    i.preferences.project_names = false;
    assert_eq!(
        mapped(&i, &[], &[t.clone()]).payload["details"],
        "Installing content"
    );
    i.preferences.downloads = false;
    assert_eq!(mapped(&i, &[], &[t.clone()]).kind, Kind::Home);
    i.preferences.downloads = true;
    for status in [
        TaskStatus::Cancelling,
        TaskStatus::Completed,
        TaskStatus::Cancelled,
        TaskStatus::Failed,
    ] {
        t.status = status;
        t.error = Some(BackendError::new("network", "private token/path"));
        assert_eq!(mapped(&i, &[], &[t.clone()]).kind, Kind::Home);
    }
}
#[test]
fn long_unicode_names_defaults_disabled_and_assets() {
    assert_eq!(
        Configuration::default().application_id,
        "1557109738037055498"
    );
    let mut i = input();
    assert_eq!(
        serde_json::from_str::<Preferences>("{}").unwrap(),
        Preferences::default()
    );
    let mut s = session();
    s.name = "Очень длинное имя 🐤".repeat(30);
    let p = mapped(&i, &[s], &[]);
    for key in ["details", "state"] {
        assert!(p.payload[key].as_str().unwrap().len() <= 128);
    }
    assert!(p.payload.get("assets").is_none());
    assert_eq!(p.payload["buttons"].as_array().unwrap().len(), 1);
    assert_eq!(
        p.payload["buttons"][0]["url"],
        "https://plash3r.github.io/canarylauncher-site/"
    );
    i.preferences.enabled = false;
    assert!(map(&i, &[], &[], &[], &Configuration::default()).is_none());
    i.preferences.enabled = true;
    let mut c = Configuration::default();
    c.confirmed_assets = vec!["canary_logo".into(), "fabric".into()];
    let p = map(&i, &[session()], &[], &[], &c).unwrap();
    assert_eq!(p.payload["assets"]["large_image"], "canary_logo");
    assert_eq!(p.payload["assets"]["small_image"], "fabric");
    c.website = Some("https://github.com/private/canary".into());
    assert!(map(&i, &[], &[], &[], &c)
        .unwrap()
        .payload
        .get("buttons")
        .is_none());
    c.website = Some("https://example.org/canary".into());
    assert_eq!(
        map(&i, &[], &[], &[], &c).unwrap().payload["buttons"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn dedup_throttle_and_immediate_game_and_task_exit() {
    let now = Instant::now();
    let i = input();
    let a = mapped(&i, &[], &[task()]);
    let mut gate = Schedule::default();
    assert!(gate.due(&a, now));
    gate.sent(a.clone(), now);
    assert!(!gate.due(&a, now + Duration::from_secs(30)));
    let mut t = task();
    t.percent = 68.;
    let b = mapped(&i, &[], &[t]);
    assert!(!gate.due(&b, now + Duration::from_secs(1)));
    assert!(gate.due(&b, now + Duration::from_secs(5)));
    assert!(gate.due(&mapped(&i, &[session()], &[]), now));
    assert!(gate.due(&mapped(&i, &[], &[]), now));
}

#[cfg(unix)]
#[tokio::test]
async fn real_socket_restart_off_clear_game_exit_and_reenable() {
    use tokio::{net::UnixListener, sync::mpsc, time::timeout};
    let root = std::env::temp_dir().join(format!("canary-discord-{}", uuid::Uuid::new_v4()));
    let _cleanup = super::super::storage::Staging(root.clone());
    let b = Arc::new(Backend::with_root(root.clone()).unwrap());
    let path = root.join("discord-ipc-0");
    let listener = UnixListener::bind(&path).unwrap();
    let (messages, mut received) = mpsc::unbounded_channel();
    let (closed, mut closures) = mpsc::unbounded_channel();
    let server = tokio::spawn(async move {
        loop {
            let (socket, _) = listener.accept().await.unwrap();
            let mut c = ipc::Connection::test_socket(socket);
            let Ok((_, hello)) = c.test_read().await else {
                continue;
            };
            assert_eq!(hello["client_id"], Configuration::default().application_id);
            c.test_write(1, &serde_json::json!({"evt":"READY"}))
                .await
                .unwrap();
            while let Ok((opcode, payload)) = c.test_read().await {
                if opcode == 3 {
                    c.test_write(4, &payload).await.unwrap();
                    continue;
                }
                messages.send(payload["args"]["activity"].clone()).unwrap();
                c.test_write(
                    1,
                    &serde_json::json!({"cmd":"SET_ACTIVITY","nonce":payload["nonce"]}),
                )
                .await
                .unwrap();
                if payload["args"]["activity"]["details"] == "Managing instances" {
                    break;
                }
            }
            let _ = closed.send(());
        }
    });
    let manager = b.discord.clone();
    let worker = manager.clone();
    let weak = Arc::downgrade(&b);
    let worker_path = path.clone();
    let worker = tokio::spawn(async move {
        worker
            .run(
                weak,
                Configuration::default(),
                move |id| {
                    let path = worker_path.clone();
                    async move { ipc::Connection::test_connect(&path, &id).await }
                },
                |_| {},
            )
            .await;
    });
    async fn next(r: &mut mpsc::UnboundedReceiver<Value>) -> Value {
        timeout(Duration::from_secs(8), async {
            loop {
                let p = r.recv().await.unwrap();
                if !p.is_null() {
                    return p;
                }
            }
        })
        .await
        .unwrap()
    }
    async fn cleared(r: &mut mpsc::UnboundedReceiver<Value>, c: &mut mpsc::UnboundedReceiver<()>) {
        timeout(Duration::from_secs(2),async{tokio::select!{p=r.recv()=>assert!(p.unwrap().is_null()),closed=c.recv()=>assert!(closed.is_some())}}).await.unwrap();
    }
    manager.update(input());
    assert_eq!(next(&mut received).await["details"], "On the home page");
    let mut i = input();
    i.view.kind = ViewKind::Library;
    manager.update(i.clone());
    assert_eq!(next(&mut received).await["details"], "Managing instances");
    // Server closes the socket: the manager discovers the failure and reconnects.
    i.view.kind = ViewKind::Settings;
    manager.update(i.clone());
    assert_eq!(next(&mut received).await["details"], "Configuring Canary");
    // Let the acknowledged navigation transaction settle before testing explicit clear.
    tokio::time::sleep(Duration::from_millis(50)).await;
    while closures.try_recv().is_ok() {}
    i.preferences.enabled = false;
    manager.update(i.clone());
    cleared(&mut received, &mut closures).await;
    i.preferences.enabled = true;
    manager.update(i.clone());
    assert_eq!(next(&mut received).await["details"], "Configuring Canary");
    // A real spawned OS child, stored in the existing process registry.
    let child = tokio::process::Command::new("/bin/sleep")
        .arg("10")
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let pid = child.id().unwrap();
    let child = Arc::new(tokio::sync::Mutex::new(child));
    let mut game = session();
    game.started_at = now();
    b.processes.lock().unwrap().insert(
        "game".into(),
        super::super::process::Running {
            session: Some(game.clone()),
            pid,
            account: String::new(),
            child: child.clone(),
            stopping: Arc::new(AtomicBool::new(false)),
        },
    );
    manager.changed();
    let playing = next(&mut received).await;
    assert_eq!(playing["timestamps"]["start"], game.started_at);
    i.view.kind = ViewKind::Discover;
    manager.update(i.clone());
    assert!(timeout(Duration::from_millis(400), received.recv())
        .await
        .is_err());
    child.lock().await.kill().await.unwrap();
    b.processes.lock().unwrap().remove("game");
    manager.changed();
    assert_eq!(
        next(&mut received).await["details"],
        "Browsing projects"
    );
    while closures.try_recv().is_ok() {}
    manager.shutdown();
    cleared(&mut received, &mut closures).await;
    timeout(Duration::from_secs(4), worker)
        .await
        .unwrap()
        .unwrap();
    server.abort();
}
