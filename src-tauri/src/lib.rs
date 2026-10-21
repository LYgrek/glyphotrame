mod canal;
mod export;
mod video;

use std::path::Path;
use tauri::ipc::Response;
use tauri_plugin_shell::ShellExt;

/// Extensions acceptées par `lire_image`.
const EXTENSIONS_IMAGES: [&str; 9] = ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "ico"];

/// Lit une image du disque à partir de son chemin (projet rouvert : le chemin est enregistré
/// dans le fichier .json). Le plugin fs, lui, n'autorise que les fichiers choisis dans les boîtes
/// de dialogue ; cette commande est limitée aux images.
#[tauri::command]
fn lire_image(chemin: String) -> Result<Response, String> {
    lire_octets_image(Path::new(&chemin)).map(Response::new)
}

fn lire_octets_image(chemin: &Path) -> Result<Vec<u8>, String> {
    let ext = chemin
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !EXTENSIONS_IMAGES.contains(&ext.as_str()) {
        return Err("Ce fichier n'est pas une image.".into());
    }
    std::fs::read(chemin).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Image introuvable.".into()
        } else {
            format!("Lecture impossible : {e}")
        }
    })
}

/// Versions de ffmpeg et ffprobe (sidecars, voir docs/video.md) : première ligne de « -version ».
/// ffmpeg n'est lancé que depuis le Rust, avec des arguments fixés ici, jamais venus de l'interface.
#[tauri::command]
async fn version_ffmpeg(app: tauri::AppHandle) -> Result<String, String> {
    let mut lignes = Vec::new();
    for nom in ["ffmpeg", "ffprobe"] {
        let sortie = app
            .shell()
            .sidecar(nom)
            .map_err(|e| format!("{nom} introuvable (lancer tools/get-ffmpeg.ps1) : {e}"))?
            .args(["-hide_banner", "-version"])
            .output()
            .await
            .map_err(|e| format!("{nom} ne démarre pas : {e}"))?;
        if !sortie.status.success() {
            return Err(format!("{nom} a échoué (code {:?})", sortie.status.code()));
        }
        lignes.push(premiere_ligne(&sortie.stdout));
    }
    Ok(lignes.join("\n"))
}

fn premiere_ligne(octets: &[u8]) -> String {
    String::from_utf8_lossy(octets).lines().next().unwrap_or("").trim().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        // mises à jour automatiques (docs/notes.md, « Mises à jour ») ; process : redémarrer après l'installation
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .manage(video::CacheInfos::default())
        .manage(video::Lectures::default())
        .manage(export::Exports::default())
        .invoke_handler(tauri::generate_handler![
            lire_image,
            version_ffmpeg,
            video::infos_video,
            video::image_video,
            video::lecture_debut,
            video::lecture_image,
            video::lecture_fin,
            export::export_debut,
            export::export_lire_image,
            export::export_ecrire_image,
            export::export_fin,
            export::export_annuler
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_une_image() {
        let chemin = std::env::temp_dir().join("glyphotrame-test-lecture.PNG");
        std::fs::write(&chemin, [1u8, 2, 3]).unwrap();
        assert_eq!(lire_octets_image(&chemin).unwrap(), vec![1, 2, 3]);
        std::fs::remove_file(chemin).unwrap();
    }

    #[test]
    fn refuse_un_fichier_qui_n_est_pas_une_image() {
        let chemin = std::env::temp_dir().join("glyphotrame-test.txt");
        std::fs::write(&chemin, "secret").unwrap();
        assert_eq!(lire_octets_image(&chemin).unwrap_err(), "Ce fichier n'est pas une image.");
        assert!(lire_octets_image(Path::new("C:/sans-extension")).is_err());
        std::fs::remove_file(chemin).unwrap();
    }

    #[test]
    fn premiere_ligne_de_la_version() {
        assert_eq!(premiere_ligne(b"ffmpeg version n9.0 Copyright\r\nbuilt with gcc\r\n"), "ffmpeg version n9.0 Copyright");
        assert_eq!(premiere_ligne(b""), "");
    }

    #[test]
    fn signale_une_image_introuvable() {
        let chemin = std::env::temp_dir().join("glyphotrame-n-existe-pas.jpg");
        assert_eq!(lire_octets_image(&chemin).unwrap_err(), "Image introuvable.");
    }
}
