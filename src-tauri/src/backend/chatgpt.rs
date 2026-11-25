use super::model::{BackendError, Instance, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
};

const MAX_PACKET: u64 = 1024 * 1024;
const RPC_TIMEOUT: Duration = Duration::from_secs(15);
static SESSION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct Server {
    _child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next_id: u64,
}

fn protocol_error() -> BackendError {
    BackendError::new("pack_chatgpt_protocol", "Codex could not complete the request")
}

impl Server {
    async fn start(root: &Path) -> Result<Self> {
        let home = root.join("codex");
        let workspace = home.join("planning");
        super::protected_fs::create_dir_all(&workspace)?;

        let mut command = Command::new("codex");
        command
            .args(["--disable", "shell_tool", "--disable", "plugins", "--disable", "multi_agent",
                   "--disable", "multi_agent_v2", "-c", "web_search=\"disabled\"", "-c",
                   "cli_auth_credentials_store=\"auto\"", "app-server", "--listen", "stdio://"])
            .current_dir(&workspace)
            .env_clear()
            .env("CODEX_HOME", &home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        // Retain OS, trust-store and proxy settings. Codex uses only the account
        // it manages in this profile, even when Canary inherits API credentials.
        for name in ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "APPDATA",
                     "LOCALAPPDATA", "TMP", "TEMP", "TMPDIR", "XDG_RUNTIME_DIR",
                     "DBUS_SESSION_BUS_ADDRESS", "XDG_DATA_HOME", "XDG_CONFIG_HOME",
                     "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy",
                     "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let spawn = |error: std::io::Error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                BackendError::new("pack_chatgpt_missing", "Install the official Codex CLI and make codex available on PATH")
            } else {
                protocol_error()
            }
        };
        #[cfg(windows)]
        let mut child = command.spawn().or_else(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                // npm installs a cmd shim on Windows. All arguments above are fixed.
                let mut shim = Command::new("codex.cmd");
                shim.args(command.as_std().get_args())
                    .env_clear()
                    .envs(command.as_std().get_envs().filter_map(|(key, value)| value.map(|value| (key, value))))
                    .current_dir(&workspace)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .kill_on_drop(true)
                    .creation_flags(0x08000000)
                    .spawn()
            } else {
                Err(error)
            }
        }).map_err(spawn)?;
        #[cfg(not(windows))]
        let mut child = command.spawn().map_err(spawn)?;

        let input = child.stdin.take().ok_or_else(protocol_error)?;
        let output = child.stdout.take().ok_or_else(protocol_error)?;
        let mut server = Self { _child: child, input, output: BufReader::new(output), next_id: 0 };
        server.call("initialize", json!({"clientInfo":{"name":"canary_launcher","title":"Canary","version":env!("CARGO_PKG_VERSION")}})).await?;
        server.write(json!({"method":"initialized"})).await?;
        Ok(server)
    }

    async fn write(&mut self, message: Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&message).map_err(|_| protocol_error())?;
        bytes.push(b'\n');
        self.input.write_all(&bytes).await.map_err(|_| protocol_error())
    }

    async fn read(&mut self) -> Result<Value> {
        loop {
            let mut packet = Vec::new();
            let read = (&mut self.output).take(MAX_PACKET + 1).read_until(b'\n', &mut packet).await
                .map_err(|_| protocol_error())?;
            if read == 0 || read as u64 > MAX_PACKET {
                return Err(protocol_error());
            }
            let message: Value = serde_json::from_slice(&packet).map_err(|_| protocol_error())?;
            if message.get("method").is_some() && message.get("id").is_some() {
                self.write(json!({"id":message["id"],"error":{"code":-32601,"message":"Canary does not accept agent-initiated actions"}})).await?;
                continue;
            }
            return Ok(message);
        }
    }

    async fn call(&mut self, method: &str, params: Value) -> Result<Value> {
        self.next_id += 1;
        let id = self.next_id;
        self.write(json!({"id":id,"method":method,"params":params})).await?;
        loop {
            let response = self.read().await?;
            if response["id"].as_u64() == Some(id) {
                return response.get("result").cloned().ok_or_else(protocol_error);
            }
        }
    }

    async fn signed_in(&mut self) -> Result<bool> {
        let response = self.call("account/read", json!({"refreshToken":false})).await?;
        Ok(response["account"]["type"] == "chatgpt")
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountAction {
    Status,
    SignIn,
    SignOut,
}

fn valid_auth_url(input: &str) -> bool {
    reqwest::Url::parse(input).is_ok_and(|url| {
        url.scheme() == "https"
            && matches!(url.host_str(), Some("auth.openai.com" | "auth0.openai.com"))
            && url.port_or_known_default() == Some(443)
            && url.username().is_empty()
            && url.password().is_none()
    })
}

pub async fn account(root: &Path, app: &AppHandle, action: AccountAction) -> Result<bool> {
    let _session = SESSION.try_lock().map_err(|_| BackendError::new("busy", "A ChatGPT request is already active"))?;
    let mut server = tokio::time::timeout(RPC_TIMEOUT, Server::start(root)).await.map_err(|_| protocol_error())??;
    match action {
        AccountAction::Status => tokio::time::timeout(RPC_TIMEOUT, server.signed_in()).await.map_err(|_| protocol_error())?,
        AccountAction::SignOut => {
            tokio::time::timeout(RPC_TIMEOUT, server.call("account/logout", json!({}))).await.map_err(|_| protocol_error())??;
            Ok(false)
        }
        AccountAction::SignIn => {
            let login = tokio::time::timeout(RPC_TIMEOUT, server.call("account/login/start", json!({"type":"chatgpt"})))
                .await.map_err(|_| protocol_error())??;
            let url = login["authUrl"].as_str().filter(|url| valid_auth_url(url)).ok_or_else(protocol_error)?;
            let id = login["loginId"].as_str().ok_or_else(protocol_error)?;
            app.opener().open_url(url, None::<&str>).map_err(|_| BackendError::new("pack_chatgpt_browser", "Could not open the ChatGPT sign-in page"))?;
            tokio::time::timeout(Duration::from_secs(240), async {
                loop {
                    let message = server.read().await?;
                    if message["method"] == "account/login/completed" && message["params"]["loginId"] == id {
                        if message["params"]["success"] == true {
                            return server.signed_in().await;
                        }
                        return Err(BackendError::new("pack_chatgpt_login", "ChatGPT sign-in did not complete"));
                    }
                }
            }).await.map_err(|_| BackendError::new("pack_chatgpt_login", "ChatGPT sign-in timed out"))?
        }
    }
}

pub async fn suggest(root: &Path, instance: &Instance, prompt: &str) -> Result<Vec<String>> {
    let prompt = super::pack_assistant::validated_prompt(instance, prompt)?;
    let _session = SESSION.try_lock().map_err(|_| BackendError::new("busy", "A ChatGPT request is already active"))?;
    tokio::time::timeout(Duration::from_secs(90), async {
        let mut server = Server::start(root).await?;
        if !server.signed_in().await? {
            return Err(BackendError::new("pack_chatgpt_login", "Sign in to ChatGPT first"));
        }
        let thread = server.call("thread/start", json!({
            "ephemeral":true,"approvalPolicy":"never","sandbox":"read-only",
            "developerInstructions":super::pack_assistant::INSTRUCTIONS
        })).await?;
        let thread_id = thread["thread"]["id"].as_str().ok_or_else(protocol_error)?;
        let turn = server.call("turn/start", json!({
            "threadId":thread_id, "input":[{"type":"text","text":prompt,"text_elements":[]}],
            "outputSchema":super::pack_assistant::schema(),
        })).await?;
        let turn_id = turn["turn"]["id"].as_str().ok_or_else(protocol_error)?;
        let mut answer = None;
        loop {
            let message = server.read().await?;
            let params = &message["params"];
            if params["threadId"] != thread_id {
                continue;
            }
            match message["method"].as_str() {
                Some("item/completed") if params["turnId"] == turn_id && params["item"]["type"] == "agentMessage" => {
                    answer = params["item"]["text"].as_str().map(str::to_owned);
                }
                Some("turn/completed") if params["turn"]["id"] == turn_id => {
                    if params["turn"]["status"] != "completed" {
                        return Err(BackendError::new("pack_chatgpt_response", "ChatGPT did not complete the suggestion"));
                    }
                    return super::pack_assistant::parse_mods(answer.as_deref().ok_or_else(protocol_error)?);
                }
                _ => {}
            }
        }
    }).await.map_err(|_| BackendError::new("pack_chatgpt_response", "ChatGPT took too long to respond"))?
}

#[cfg(test)]
mod tests {
    use super::valid_auth_url;

    #[test]
    fn opens_only_official_chatgpt_auth_origins() {
        assert!(valid_auth_url("https://auth.openai.com/oauth/authorize?client=test"));
        for url in ["http://auth.openai.com", "https://auth.openai.com.example.test", "https://auth.openai.com:444", "https://test@auth.openai.com"] {
            assert!(!valid_auth_url(url));
        }
    }
}
