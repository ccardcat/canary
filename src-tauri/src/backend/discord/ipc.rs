//! Discord's local RPC framing over Tokio Unix sockets / Windows named pipes.
//! The crate's blocking client has an unbounded handshake; use its maintained
//! activity model with cancellable, bounded transport instead. No HTTP/auth.
use serde_json::{json, Value};
use std::{io, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    time::timeout,
};

const IO_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_FRAME: usize = 64 * 1024;
trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}
pub(super) struct Connection {
    stream: Box<dyn Stream>,
}
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid Discord RPC response")
}

impl Connection {
    #[cfg(all(test, unix))]
    pub(super) fn test_socket(socket: tokio::net::UnixStream) -> Self {
        Self {
            stream: Box::new(socket),
        }
    }
    #[cfg(all(test, unix))]
    pub(super) async fn test_connect(path: &std::path::Path, id: &str) -> io::Result<Self> {
        let mut c = Self::test_socket(tokio::net::UnixStream::connect(path).await?);
        c.handshake(id).await?;
        Ok(c)
    }
    #[cfg(all(test, unix))]
    pub(super) async fn test_read(&mut self) -> io::Result<(u32, Value)> {
        self.read().await
    }
    #[cfg(all(test, unix))]
    pub(super) async fn test_write(&mut self, op: u32, p: &Value) -> io::Result<()> {
        self.write(op, p).await
    }
    pub(super) async fn connect(id: &str) -> io::Result<Self> {
        if !id.parse::<u64>().is_ok_and(|id| id > 0) {
            return Err(invalid());
        }
        // Try every candidate; a stale socket must not hide a live Discord client.
        for path in paths() {
            #[cfg(unix)]
            let stream: io::Result<Box<dyn Stream>> =
                timeout(IO_TIMEOUT, tokio::net::UnixStream::connect(&path))
                    .await
                    .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))
                    .and_then(|s| s.map(|s| Box::new(s) as Box<dyn Stream>));
            #[cfg(windows)]
            let stream: io::Result<Box<dyn Stream>> =
                tokio::net::windows::named_pipe::ClientOptions::new()
                    .open(&path)
                    .map(|s| Box::new(s) as Box<dyn Stream>);
            if let Ok(stream) = stream {
                let mut connection = Self { stream };
                if timeout(IO_TIMEOUT, connection.handshake(id))
                    .await
                    .is_ok_and(|r| r.is_ok())
                {
                    return Ok(connection);
                }
            }
        }
        Err(io::Error::from(io::ErrorKind::NotConnected))
    }
    async fn write(&mut self, opcode: u32, payload: &Value) -> io::Result<()> {
        let data = serde_json::to_vec(payload).map_err(|_| invalid())?;
        if data.len() > MAX_FRAME {
            return Err(invalid());
        }
        let mut frame = Vec::with_capacity(data.len() + 8);
        frame.extend_from_slice(&opcode.to_le_bytes());
        frame.extend_from_slice(&(data.len() as u32).to_le_bytes());
        frame.extend_from_slice(&data);
        self.stream.write_all(&frame).await?;
        self.stream.flush().await
    }
    async fn read(&mut self) -> io::Result<(u32, Value)> {
        let mut header = [0u8; 8];
        self.stream.read_exact(&mut header).await?;
        let opcode = u32::from_le_bytes(header[..4].try_into().map_err(|_| invalid())?);
        let length = u32::from_le_bytes(header[4..].try_into().map_err(|_| invalid())?) as usize;
        if length > MAX_FRAME {
            return Err(invalid());
        }
        let mut data = vec![0; length];
        self.stream.read_exact(&mut data).await?;
        Ok((
            opcode,
            serde_json::from_slice(&data).map_err(|_| invalid())?,
        ))
    }
    async fn handshake(&mut self, id: &str) -> io::Result<()> {
        self.write(0, &json!({"v":1,"client_id":id})).await?;
        loop {
            let (op, payload) = self.read().await?;
            match op {
                3 => self.write(4, &payload).await?,
                1 if payload["evt"] == "READY" => return Ok(()),
                _ => return Err(invalid()),
            }
        }
    }
    async fn exchange(&mut self, activity: Value) -> io::Result<()> {
        let nonce = uuid::Uuid::new_v4().to_string();
        self.write(1,&json!({"cmd":"SET_ACTIVITY","args":{"pid":std::process::id(),"activity":activity},"nonce":nonce})).await?;
        loop {
            let (op, payload) = self.read().await?;
            match op {
                3 => self.write(4, &payload).await?,
                2 => return Err(io::Error::from(io::ErrorKind::ConnectionAborted)),
                1 if payload["nonce"] == nonce => {
                    return if payload["evt"] == "ERROR" || payload["cmd"] != "SET_ACTIVITY" {
                        Err(invalid())
                    } else {
                        Ok(())
                    }
                }
                1 => {}
                _ => return Err(invalid()),
            }
        }
    }
    pub(super) async fn publish(&mut self, activity: &Value) -> io::Result<()> {
        timeout(IO_TIMEOUT, self.exchange(activity.clone()))
            .await
            .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?
    }
    pub(super) async fn clear(&mut self) -> io::Result<()> {
        timeout(IO_TIMEOUT, self.exchange(Value::Null))
            .await
            .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?
    }
    pub(super) async fn probe(&mut self) -> io::Result<()> {
        timeout(IO_TIMEOUT, async {
            let nonce = uuid::Uuid::new_v4().to_string();
            self.write(3, &json!({"nonce":nonce})).await?;
            loop {
                let (op, payload) = self.read().await?;
                match op {
                    4 if payload["nonce"] == nonce => return Ok(()),
                    3 => self.write(4, &payload).await?,
                    1 => {}
                    _ => return Err(invalid()),
                }
            }
        })
        .await
        .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?
    }
}

fn paths() -> Vec<std::path::PathBuf> {
    #[cfg(windows)]
    {
        (0..10)
            .map(|i| format!(r"\\.\pipe\discord-ipc-{i}").into())
            .collect()
    }
    #[cfg(unix)]
    {
        let mut roots = vec![];
        for key in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"] {
            if let Some(path) = std::env::var_os(key) {
                let path = std::path::PathBuf::from(path);
                if path.is_absolute() && !roots.contains(&path) {
                    roots.push(path);
                }
            }
        }
        roots.push(std::path::PathBuf::from("/tmp"));
        let mut paths = vec![];
        for root in roots {
            for sub in [
                "",
                "app/com.discordapp.Discord",
                "app/dev.vencord.Vesktop",
                ".flatpak/com.discordapp.Discord/xdg-run",
                ".flatpak/dev.vencord.Vesktop/xdg-run",
                "snap.discord",
                "snap.discord-canary",
            ] {
                for i in 0..10 {
                    let path = root.join(sub).join(format!("discord-ipc-{i}"));
                    if path.exists() && !paths.contains(&path) {
                        paths.push(path);
                    }
                }
            }
        }
        paths
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn fragmented_handshake_ping_update_clear_and_disconnect() {
        let (a, b) = tokio::io::duplex(4096);
        let mut client = Connection {
            stream: Box::new(a),
        };
        let server = tokio::spawn(async move {
            let mut server = Connection {
                stream: Box::new(b),
            };
            let (op, hello) = server.read().await.unwrap();
            assert_eq!(op, 0);
            assert_eq!(
                hello["client_id"],
                super::super::Configuration::default().application_id
            );
            // Exercise partial headers and UTF-8 payloads, not just a JSON mock.
            let body = br#"{"evt":"READY","data":{}}"#;
            let mut bytes = vec![];
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.extend_from_slice(&(body.len() as u32).to_le_bytes());
            bytes.extend_from_slice(body);
            for byte in bytes {
                server.stream.write_all(&[byte]).await.unwrap();
                tokio::task::yield_now().await;
            }
            server.write(3, &json!({"nonce":"ping"})).await.unwrap();
            for expected in [false, true] {
                let payload = loop {
                    let (op, p) = server.read().await.unwrap();
                    if op == 4 {
                        assert_eq!(p["nonce"], "ping");
                        continue;
                    }
                    assert_eq!(op, 1);
                    break p;
                };
                assert_eq!(payload["args"]["activity"].is_null(), expected);
                if !expected {
                    assert_eq!(
                        payload["args"]["activity"]["details"],
                        "Играет через Canary"
                    );
                }
                server
                    .write(
                        1,
                        &json!({"cmd":"SET_ACTIVITY","nonce":payload["nonce"],"data":{}}),
                    )
                    .await
                    .unwrap();
            }
        });
        client
            .handshake(&super::super::Configuration::default().application_id)
            .await
            .unwrap();
        client
            .publish(&json!({"details":"Играет через Canary"}))
            .await
            .unwrap();
        client.clear().await.unwrap();
        server.await.unwrap();
        assert!(client.publish(&json!({})).await.is_err());
    }
    #[tokio::test]
    async fn rejected_activity_and_oversized_reply_are_not_success() {
        let (a, b) = tokio::io::duplex(4096);
        let mut client = Connection {
            stream: Box::new(a),
        };
        let server = tokio::spawn(async move {
            let mut c = Connection {
                stream: Box::new(b),
            };
            let (_, p) = c.read().await.unwrap();
            c.write(
                1,
                &json!({"evt":"ERROR","nonce":p["nonce"],"cmd":"SET_ACTIVITY"}),
            )
            .await
            .unwrap();
        });
        assert!(client.publish(&json!({})).await.is_err());
        server.await.unwrap();
        let (a, mut b) = tokio::io::duplex(4096);
        let mut client = Connection {
            stream: Box::new(a),
        };
        b.write_all(&1u32.to_le_bytes()).await.unwrap();
        b.write_all(&((MAX_FRAME + 1) as u32).to_le_bytes())
            .await
            .unwrap();
        assert_eq!(
            client.read().await.unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
    }
    #[tokio::test]
    async fn hung_discord_is_bounded_and_does_not_panic() {
        let (a, _b) = tokio::io::duplex(4096);
        let mut client = Connection {
            stream: Box::new(a),
        };
        let started = std::time::Instant::now();
        assert_eq!(
            client.publish(&json!({})).await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        assert!(started.elapsed() < Duration::from_secs(3));
    }
}
