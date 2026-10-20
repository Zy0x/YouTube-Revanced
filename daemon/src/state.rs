use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub modpath: PathBuf,
    #[allow(dead_code)]
    pub token: String,
    pub allowed_origins: Arc<Vec<String>>,
    pub log_tx: broadcast::Sender<String>,
    pub is_patching: Arc<AtomicBool>,
    pub client: reqwest::Client,
    pub download_plans: Arc<RwLock<HashMap<String, Value>>>,
    pub preview_trees: Arc<RwLock<HashMap<String, Value>>>,
}

impl AppState {
    pub fn new(modpath: PathBuf, token: String, allowed_origins: Vec<String>) -> Self {
        let (log_tx, _) = broadcast::channel(256);
        let client = reqwest::Client::builder()
            .user_agent("RVX-Daemon/2.1.3")
            .timeout(Duration::from_secs(25))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            modpath,
            token,
            allowed_origins: Arc::new(allowed_origins),
            log_tx,
            is_patching: Arc::new(AtomicBool::new(false)),
            client,
            download_plans: Arc::new(RwLock::new(HashMap::new())),
            preview_trees: Arc::new(RwLock::new(HashMap::new())),
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
