//! Bounded, owner-scoped loopback experiment. Compiled only into native validation.
use crate::commands::plugins::{validation_process_packet, PluginStreams};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
const MAX_BODY: usize = 16388 + 32768;
pub(crate) struct Loopback {
    pub owner: String,
    pub port: u16,
    token: String,
    stop: Arc<AtomicBool>,
    task: Option<JoinHandle<()>>,
}
impl Loopback {
    pub fn start(owner: String, origin: String, streams: PluginStreams) -> Result<Self, String> {
        let mut random = [0u8; 32];
        std::fs::File::open("/dev/urandom")
            .and_then(|mut file| file.read_exact(&mut random))
            .map_err(|e| e.to_string())?;
        let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
        let listener =
            TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let stop = Arc::new(AtomicBool::new(false));
        let (shutdown, credential, window) = (stop.clone(), token.clone(), owner.clone());
        let task = thread::spawn(move || {
            let mut clients: Vec<JoinHandle<()>> = Vec::new();
            while !shutdown.load(Ordering::SeqCst) {
                let mut index = 0;
                while index < clients.len() {
                    if clients[index].is_finished() {
                        let _ = clients.swap_remove(index).join();
                    } else {
                        index += 1;
                    }
                }
                match listener.accept() {
                    Ok((mut socket, _)) if clients.len() < 8 => {
                        // Accepted sockets can inherit the listener's nonblocking mode on macOS.
                        // Body/header reads below use an absolute two-second deadline instead.
                        if socket.set_nonblocking(false).is_err() {
                            continue;
                        }
                        let (origin, token, state, owner, stopped) = (
                            origin.clone(),
                            credential.clone(),
                            streams.clone(),
                            window.clone(),
                            shutdown.clone(),
                        );
                        clients.push(thread::spawn(move || {
                            let _ = serve(&mut socket, &origin, &token, &state, &owner, &stopped);
                        }));
                    }
                    Ok(_) => (),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(1))
                    }
                    Err(_) => break,
                }
            }
            for client in clients {
                let _ = client.join();
            }
        });
        Ok(Self {
            owner,
            port,
            token,
            stop,
            task: Some(task),
        })
    }
    pub fn descriptor(&self) -> serde_json::Value {
        serde_json::json!({"url":format!("http://127.0.0.1:{}/process",self.port),"token":self.token})
    }
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(task) = self.task.take() {
            let _ = task.join();
        }
    }
}
impl Drop for Loopback {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(task) = self.task.take() {
            let _ = task.join();
        }
    }
}
fn serve(
    socket: &mut TcpStream,
    origin: &str,
    token: &str,
    streams: &PluginStreams,
    owner: &str,
    stop: &AtomicBool,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(2);
    socket
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let mut header = Vec::new();
    while !header.ends_with(b"\r\n\r\n") {
        if header.len() >= 8192 {
            return respond(socket, 413, origin, b"");
        }
        socket
            .set_read_timeout(Some(
                deadline
                    .checked_duration_since(Instant::now())
                    .ok_or("Request deadline")?,
            ))
            .map_err(|e| e.to_string())?;
        let mut byte = [0];
        socket.read_exact(&mut byte).map_err(|e| e.to_string())?;
        header.push(byte[0]);
    }
    let header = std::str::from_utf8(&header).map_err(|_| "Invalid HTTP header")?;
    let mut lines = header.split("\r\n");
    let route = lines.next().unwrap_or("");
    let fields: Vec<_> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.to_ascii_lowercase(), value.trim()))
        .collect();
    let value = |key: &str| {
        let matching: Vec<_> = fields.iter().filter(|(name, _)| name == key).collect();
        if matching.len() == 1 {
            Some(matching[0].1)
        } else {
            None
        }
    };
    if value("origin") != Some(origin) {
        return respond(socket, 403, origin, b"");
    }
    if route == "OPTIONS /process HTTP/1.1" {
        return respond(socket, 204, origin, b"");
    }
    if route != "POST /process HTTP/1.1"
        || value("authorization") != Some(format!("Bearer {token}").as_str())
    {
        return respond(socket, 401, origin, b"");
    }
    let length = value("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if !(4..=MAX_BODY).contains(&length) || value("transfer-encoding").is_some() {
        return respond(socket, 413, origin, b"");
    }
    let mut body = vec![0; length];
    let mut read = 0;
    while read < length {
        socket
            .set_read_timeout(Some(
                deadline
                    .checked_duration_since(Instant::now())
                    .ok_or("Request deadline")?,
            ))
            .map_err(|e| e.to_string())?;
        let count = socket.read(&mut body[read..]).map_err(|e| e.to_string())?;
        if count == 0 {
            return Err("Truncated request".into());
        }
        read += count;
    }
    if stop.load(Ordering::SeqCst) {
        return respond(socket, 410, origin, b"");
    }
    match validation_process_packet(streams, owner, &body) {
        Ok(reply) => respond(socket, 200, origin, &reply),
        Err(_) => respond(socket, 400, origin, b"Invalid native block"),
    }
}
fn respond(socket: &mut TcpStream, status: u16, origin: &str, body: &[u8]) -> Result<(), String> {
    let header = format!("HTTP/1.1 {status} Response\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: {origin}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type\r\nCross-Origin-Resource-Policy: cross-origin\r\nConnection: close\r\n\r\n",body.len());
    socket
        .write_all(header.as_bytes())
        .and_then(|_| socket.write_all(body))
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn request(server: &Loopback, header: String) -> String {
        let mut socket = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, server.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        socket.write_all(header.as_bytes()).unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        response
    }
    #[test]
    fn accepts_delayed_request_headers() {
        let server = Loopback::start(
            "owned".into(),
            "http://127.0.0.1:1234".into(),
            PluginStreams::default(),
        )
        .unwrap();
        let mut socket = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, server.port)).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        thread::sleep(Duration::from_millis(40));
        socket.write_all(b"POST /process HTTP/1.1\r\nOrigin: http://127.0.0.1:1234\r\nContent-Length: 4\r\n\r\n").unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 401"));
        server.stop();
    }
    #[test]
    fn authenticates_bounds_and_revokes_endpoint() {
        let state = PluginStreams::default();
        let server = Loopback::start(
            "owned".into(),
            "http://127.0.0.1:1234".into(),
            state.clone(),
        )
        .unwrap();
        let port = server.port;
        let base = "Origin: http://127.0.0.1:1234\r\n";
        assert!(request(
            &server,
            format!("POST /process HTTP/1.1\r\n{base}Content-Length: 4\r\n\r\n")
        )
        .starts_with("HTTP/1.1 401"));
        assert!(request(&server,format!("POST /process HTTP/1.1\r\nOrigin: http://other\r\nAuthorization: Bearer {}\r\nContent-Length: 4\r\n\r\n",server.token)).starts_with("HTTP/1.1 403"));
        assert!(request(&server,format!("POST /process HTTP/1.1\r\n{base}Authorization: Bearer {}\r\nContent-Length: 999999\r\n\r\n",server.token)).starts_with("HTTP/1.1 413"));
        assert!(request(&server,format!("POST /process HTTP/1.1\r\n{base}Authorization: Bearer {}\r\nContent-Length: 4\r\n\r\nxxxx",server.token)).starts_with("HTTP/1.1 400"));
        assert_eq!(state.validation_counts(), (0, 0));
        server.stop();
        assert!(TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).is_err());
    }
}
