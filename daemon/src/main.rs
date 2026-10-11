use std::net::SocketAddr;
use std::path::PathBuf;
use axum::{routing::get, Router};
use clap::Parser;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod embedded;
mod jre;
mod patcher;
mod state;
mod utils;

use embedded::static_handler;
use state::AppState;

#[derive(Parser, Debug)]
#[command(name = "rvx-daemon", version = "2.1.7", about = "On-Device YouTube RVX Patcher Daemon")]
struct CliArgs {
    /// IP address to bind to. Default: 127.0.0.1 (loopback).
    /// Use 0.0.0.0 for LAN access during development/testing.
    #[arg(short, long, default_value = "127.0.0.1")]
    bind: String,

    /// Port to listen on
    #[arg(short, long, default_value_t = 8080)]
    port: u16,

    /// Root path of the Magisk/KernelSU/APatch module
    #[arg(short, long)]
    modpath: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rvx_daemon=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = CliArgs::parse();

    // Security: default is loopback. Allow 0.0.0.0 for explicit LAN/dev mode.
    // On Android module production, service.sh passes no --bind so it stays loopback.
    let bind_addr = match args.bind.as_str() {
        "127.0.0.1" | "localhost" => args.bind,
        "0.0.0.0" => {
            tracing::warn!("⚠️  Binding to 0.0.0.0 — LAN access enabled. Use only for local development/testing.");
            args.bind
        }
        other => {
            tracing::warn!("Unknown bind address '{}'. Falling back to '127.0.0.1' for security.", other);
            "127.0.0.1".to_string()
        }
    };

    let modpath = args.modpath.unwrap_or_else(|| {
        let default_android = PathBuf::from("/data/adb/modules/YouTube-RVX");
        if default_android.exists() {
            default_android
        } else {
            // Local dev fallback
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        }
    });

    tracing::info!("Starting YouTube RVX Daemon v2.1.5");
    tracing::info!("Module Path: {}", modpath.display());

    // Generate or read session token
    let token_file = modpath.join(".daemon_token");
    let token = if let Ok(existing) = std::fs::read_to_string(&token_file) {
        existing.trim().to_string()
    } else {
        let new_token = format!("{:x}", rand_u128());
        let _ = std::fs::write(&token_file, &new_token);
        new_token
    };

    let state = AppState::new(modpath.clone(), token);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .nest("/api/v1", api::router(state.clone()))
        .fallback(get(static_handler))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = format!("{}:{}", bind_addr, args.port).parse()?;
    tracing::info!("🚀 Server running at http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn rand_u128() -> u128 {
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    (duration.as_nanos() ^ 0x517cc1b727220a95) as u128
}
