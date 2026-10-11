use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AppState {
    pub modpath: PathBuf,
    #[allow(dead_code)]
    pub token: String,
    pub log_tx: broadcast::Sender<String>,
    pub is_patching: Arc<AtomicBool>,
    pub client: reqwest::Client,
}

impl AppState {
    pub fn new(modpath: PathBuf, token: String) -> Self {
        let (log_tx, _) = broadcast::channel(256);
        let client = reqwest::Client::builder()
            .user_agent("RVX-Daemon/2.1.3")
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            modpath,
            token,
            log_tx,
            is_patching: Arc::new(AtomicBool::new(false)),
            client,
        }
    }

    pub fn set_patching(&self, val: bool) {
        self.is_patching.store(val, Ordering::SeqCst);
    }

    pub fn is_patching(&self) -> bool {
        self.is_patching.load(Ordering::SeqCst)
    }

    pub fn log(&self, msg: impl Into<String>) {
        let m = msg.into();
        let _ = self.log_tx.send(m);
    }
}
