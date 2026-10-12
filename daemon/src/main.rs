use std::net::SocketAddr;
use std::path::PathBuf;
use axum::{routing::get, Router};
use clap::{Parser, Subcommand};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod cli;
mod embedded;
mod jre;
mod patcher;
mod state;
mod utils;

use embedded::static_handler;
use state::AppState;

#[derive(Parser, Debug)]
#[command(
    name = "rvx-daemon",
    version = env!("CARGO_PKG_VERSION"),
    about = "YouTube RVX High-Performance Native Core & On-Device Daemon"
)]
struct CliArgs {
    #[command(subcommand)]
    command: Option<Commands>,

    /// IP address to bind to for server mode. Default: 127.0.0.1
    #[arg(short, long, default_value = "127.0.0.1")]
    bind: String,

    /// Port to listen on for server mode. Default: 8088
    #[arg(short, long, default_value_t = 8088)]
    port: u16,

    /// Root path of the Magisk/KernelSU/APatch module
    #[arg(short, long)]
    modpath: Option<PathBuf>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Run WebUI HTTP & SSE API server (default)
    Server {
        #[arg(short, long, default_value = "127.0.0.1")]
        bind: String,
        #[arg(short, long, default_value_t = 8088)]
        port: u16,
    },
    /// Run boot service (replaces service.sh in native Rust)
    Service {
        #[arg(short, long)]
        modpath: Option<PathBuf>,
    },
    /// Run manager action button (replaces action.sh in native Rust)
    Action {
        #[arg(short, long)]
        modpath: Option<PathBuf>,
    },
    /// Run module installer (replaces customize.sh in native Rust)
    Install {
        #[arg(short, long)]
        modpath: Option<PathBuf>,
        #[arg(long)]
        bootmode: Option<String>,
    },
    /// Run module uninstaller (replaces uninstall.sh in native Rust)
    Uninstall {
        #[arg(short, long)]
        modpath: Option<PathBuf>,
    },
    /// High-speed native ZIP module packager
    Pack {
        #[arg(short, long)]
        modpath: Option<PathBuf>,
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
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

    let modpath = args.modpath.clone().unwrap_or_else(|| {
        let default_android = PathBuf::from("/data/adb/modules/YouTube-RVX");
        if default_android.exists() {
            default_android
        } else {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        }
    });

    std::env::set_var("MODPATH", &modpath);

    match args.command {
        Some(Commands::Service { modpath: m }) => {
            cli::run_service(m.unwrap_or(modpath)).await?;
        }
        Some(Commands::Action { modpath: m }) => {
            cli::run_action(m.unwrap_or(modpath)).await?;
        }
        Some(Commands::Install { modpath: m, bootmode }) => {
            cli::run_install(m.unwrap_or(modpath), bootmode).await?;
        }
        Some(Commands::Uninstall { modpath: m }) => {
            cli::run_uninstall(m.unwrap_or(modpath)).await?;
        }
        Some(Commands::Pack { modpath: m, output }) => {
            cli::run_pack(m.unwrap_or(modpath), output).await?;
        }
        Some(Commands::Server { bind, port }) => {
            run_server(&bind, port, modpath).await?;
        }
        None => {
            run_server(&args.bind, args.port, modpath).await?;
        }
    }

    Ok(())
}

async fn run_server(bind_addr_str: &str, port: u16, modpath: PathBuf) -> anyhow::Result<()> {
    let bind_addr = match bind_addr_str {
        "127.0.0.1" | "localhost" => bind_addr_str.to_string(),
        "0.0.0.0" => {
            tracing::warn!("⚠️  Binding to 0.0.0.0 — LAN access enabled.");
            bind_addr_str.to_string()
        }
        other => {
            tracing::warn!("Unknown bind address '{}'. Falling back to '127.0.0.1'.", other);
            "127.0.0.1".to_string()
        }
    };

    tracing::info!("Starting YouTube RVX Native Core & WebUI Daemon v{}", env!("CARGO_PKG_VERSION"));
    tracing::info!("Module Path: {}", modpath.display());

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

    let mut listener_opt = None;
    let mut bound_port = port;

    for offset in 0..15 {
        let test_port = port + offset;
        let addr: SocketAddr = match format!("{}:{}", bind_addr, test_port).parse() {
            Ok(a) => a,
            Err(_) => continue,
        };
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                bound_port = test_port;
                listener_opt = Some((listener, addr));
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::AddrInUse => {
                tracing::warn!(
                    "⚠️ Port {} is already in use (e.g. by Lynx Kernel Manager). Hunting for next port {}...",
                    test_port,
                    test_port + 1
                );
            }
            Err(err) => return Err(err.into()),
        }
    }

    let (listener, addr) = match listener_opt {
        Some(val) => val,
        None => anyhow::bail!("Could not find an available port starting from {}", port),
    };

    // Save active port to module dir and current dir for WebUI / am start launchers
    let _ = std::fs::write(modpath.join(".daemon_port"), bound_port.to_string());
    let _ = std::fs::write(".daemon_port", bound_port.to_string());

    tracing::info!("🚀 Server running at http://{}", addr);

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
