use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use serde_json::json;



pub(crate) async fn get_source_releases(
    State(state): State<AppState>,
    Query(query): Query<SourceReleaseQuery>,
) -> impl IntoResponse {
    let parts: Vec<&str> = query.repo.split('/').collect();
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    };
    if parts.len() != 2 || !parts.iter().all(|part| valid_part(part)) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid GitHub repository." })),
        )
            .into_response();
    }

    let feed_url = format!("https://github.com/{}/releases.atom", query.repo);
    let feed_response = match state.client.get(&feed_url).send().await {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": format!("GitHub returned {}", response.status()) })),
            )
                .into_response()
        }
        Err(error) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": error.to_string() })),
            )
                .into_response()
        }
    };
    let feed = match feed_response.text().await {
        Ok(text) => text,
        Err(error) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": error.to_string() })),
            )
                .into_response()
        }
    };

    let release_prefix = format!("https://github.com/{}/releases/tag/", query.repo);
    let asset_prefix = format!("/{}/releases/download/", query.repo);
    let mut releases = Vec::new();
    for entry in feed.split("<entry>").skip(1).take(10) {
        let Some(end) = entry.find("</entry>") else {
            continue;
        };
        let entry = &entry[..end];
        let name = xml_text(entry, "title").unwrap_or_default();
        let updated = xml_text(entry, "updated").unwrap_or_default();
        let Some(link_tag) = entry
            .split("<link ")
            .nth(1)
            .and_then(|part| part.split('>').next())
        else {
            continue;
        };
        let Some(release_url) = html_attribute(link_tag, "href") else {
            continue;
        };
        if !release_url.starts_with(&release_prefix) {
            continue;
        }
        let tag = release_url.trim_start_matches(&release_prefix);
        if tag.is_empty() {
            continue;
        }

        let expanded_url = format!(
            "https://github.com/{}/releases/expanded_assets/{}",
            query.repo, tag
        );
        let assets_html = match state.client.get(&expanded_url).send().await {
            Ok(response) if response.status().is_success() => {
                response.text().await.unwrap_or_default()
            }
            _ => continue,
        };
        let mut assets = Vec::new();
        for href in html_hrefs(&assets_html) {
            if !href.starts_with(&asset_prefix) || !href.to_ascii_lowercase().ends_with(".mpp") {
                continue;
            }
            let asset_name = href.rsplit('/').next().unwrap_or_default();
            assets.push(json!({
                "name": asset_name,
                "browser_download_url": format!("https://github.com{}", href)
            }));
        }
        if assets.is_empty() {
            continue;
        }

        let normalized_tag = tag.to_ascii_lowercase();
        let prerelease = ["dev", "pre", "alpha", "beta", "rc"]
            .iter()
            .any(|marker| normalized_tag.contains(marker));
        releases.push(json!({
            "tag_name": tag,
            "name": name,
            "published_at": updated,
            "prerelease": prerelease,
            "draft": false,
            "body": xml_text(entry, "content").unwrap_or_default(),
            "assets": assets
        }));
        if releases.len() >= 10 {
            break;
        }
    }

    (StatusCode::OK, Json(json!(releases))).into_response()
}


fn xml_text(xml: &str, tag: &str) -> Option<String> {
    let opening = format!("<{tag}");
    let start = xml.find(&opening)?;
    let content_start = xml[start..].find('>')? + start + 1;
    let closing = format!("</{tag}>");
    let content_end = xml[content_start..].find(&closing)? + content_start;
    let value = xml[content_start..content_end].trim();
    let value = value
        .strip_prefix("<![CDATA[")
        .and_then(|s| s.strip_suffix("]]>"))
        .unwrap_or(value);
    Some(
        value
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">"),
    )
}

fn html_attribute(tag: &str, attribute: &str) -> Option<String> {
    let needle = format!("{attribute}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].replace("&amp;", "&"))
}

pub(crate) fn html_meta_content(html: &str, property: &str) -> Option<String> {
    html.split("<meta ").skip(1).find_map(|part| {
        let tag = part.split('>').next()?;
        let tag_property =
            html_attribute(tag, "property").or_else(|| html_attribute(tag, "name"))?;
        if tag_property == property {
            html_attribute(tag, "content")
        } else {
            None
        }
    })
}

fn html_hrefs(html: &str) -> Vec<String> {
    let needle = "href=\"";
    let mut rest = html;
    let mut hrefs = Vec::new();
    while let Some(position) = rest.find(needle) {
        rest = &rest[position + needle.len()..];
        if let Some(end) = rest.find('"') {
            let href = rest[..end].replace("&amp;", "&");
            if href.contains("/releases/download/") {
                hrefs.push(href);
            }
            rest = &rest[end + 1..];
        } else {
            break;
        }
    }
    hrefs
}



#[derive(serde::Deserialize)]
pub(crate) struct AppIconQuery {
    package: String,
}



#[derive(serde::Deserialize)]
pub(crate) struct SourceReleaseQuery {
    repo: String,
}