//! Vidéo (docs/video.md) : informations (ffprobe) et image à un instant donné (ffmpeg).
//! ffmpeg / ffprobe sont des « sidecars » lancés uniquement d'ici, avec des arguments construits
//! côté Rust ; le chemin reçu de l'interface est vérifié (absolu, fichier existant, extension vidéo).

use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use tauri::ipc::Response;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Extensions acceptées pour une vidéo.
pub const EXTENSIONS_VIDEOS: [&str; 6] = ["mp4", "mov", "m4v", "webm", "mkv", "avi"];
const ILLISIBLE: &str = "Ce fichier n'est pas une vidéo lisible.";

/// Informations utiles d'une vidéo. Largeur et hauteur : dimensions affichées
/// (rotation des vidéos de téléphone et pixels non carrés pris en compte).
#[derive(Serialize, Debug, PartialEq)]
pub struct InfosVideo {
    pub largeur: u32,
    pub hauteur: u32,
    /// durée en secondes
    pub duree: f64,
    /// images par seconde (r_frame_rate)
    pub cadence: f64,
    /// nombre d'images (annoncé par le fichier, sinon durée × cadence)
    pub images: u64,
    /// rotation appliquée à l'affichage : 0, 90, 180 ou 270 degrés
    pub rotation: u32,
    pub son: bool,
    pub codec: String,
}

/// Vérifie un chemin reçu de l'interface : absolu, fichier existant, extension vidéo.
/// (Un chemin absolu ne peut pas être pris pour une option « -… » ni pour une adresse réseau.)
pub fn verifier_chemin(chemin: &str) -> Result<&Path, String> {
    let p = Path::new(chemin);
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    if !EXTENSIONS_VIDEOS.contains(&ext.as_str()) {
        return Err("Ce fichier n'est pas une vidéo (mp4, mov, m4v, webm, mkv, avi).".into());
    }
    if !p.is_absolute() {
        return Err("Chemin de vidéo invalide.".into());
    }
    if !p.is_file() {
        return Err("Vidéo introuvable.".into());
    }
    Ok(p)
}

/// « 30000/1001 » ou « 16:9 » → nombre (0 si invalide)
fn rapport(texte: &str) -> f64 {
    let mut morceaux = texte.split(|c| c == '/' || c == ':');
    let a = morceaux.next().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(0.0);
    let b = morceaux.next().and_then(|s| s.trim().parse::<f64>().ok()).unwrap_or(1.0);
    if b == 0.0 { 0.0 } else { a / b }
}

fn nombre(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
}

/// Analyse la sortie JSON de `ffprobe -show_format -show_streams`.
pub fn analyser_ffprobe(json: &str) -> Result<InfosVideo, String> {
    let v: Value = serde_json::from_str(json).map_err(|_| ILLISIBLE.to_string())?;
    let flux = v["streams"].as_array().ok_or(ILLISIBLE)?;
    let video = flux
        .iter()
        .find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_u64() != Some(1))
        .ok_or("Ce fichier ne contient pas d'images vidéo.")?;
    let largeur = video["width"].as_u64().ok_or(ILLISIBLE)? as f64;
    let hauteur = video["height"].as_u64().ok_or(ILLISIBLE)? as f64;
    if largeur < 1.0 || hauteur < 1.0 {
        return Err(ILLISIBLE.into());
    }
    // pixels non carrés (vidéo anamorphosée) : largeur affichée = largeur × rapport des pixels
    let sar = video["sample_aspect_ratio"].as_str().map(rapport).filter(|r| *r > 0.0).unwrap_or(1.0);
    // rotation : matrice d'affichage (side_data_list) ou ancienne étiquette « rotate »
    let rot = video["side_data_list"]
        .as_array()
        .and_then(|l| l.iter().find_map(|d| nombre(&d["rotation"])))
        .or_else(|| nombre(&video["tags"]["rotate"]))
        .unwrap_or(0.0);
    let rotation = (((rot / 90.0).round() as i64 * 90) % 360 + 360) % 360;
    let (mut l, mut h) = ((largeur * sar).round().max(1.0) as u32, hauteur as u32);
    if rotation == 90 || rotation == 270 {
        std::mem::swap(&mut l, &mut h);
    }
    let cadence = [&video["r_frame_rate"], &video["avg_frame_rate"]]
        .iter()
        .filter_map(|c| c.as_str().map(rapport))
        .find(|c| *c > 0.0 && c.is_finite())
        .unwrap_or(0.0);
    let duree = nombre(&v["format"]["duration"]).or_else(|| nombre(&video["duration"])).unwrap_or(0.0);
    let images = nombre(&video["nb_frames"]).map(|n| n as u64).filter(|n| *n > 0).unwrap_or((duree * cadence).round() as u64);
    Ok(InfosVideo {
        largeur: l,
        hauteur: h,
        duree,
        cadence,
        images,
        rotation: rotation as u32,
        son: flux.iter().any(|s| s["codec_type"] == "audio"),
        codec: video["codec_name"].as_str().unwrap_or("").to_string(),
    })
}

/// Taille de sortie : réduite pour que le plus grand côté ne dépasse pas `taille_max`
/// (même calcul que fitImage dans src/engine/source.js).
pub fn taille_sortie(largeur: u32, hauteur: u32, taille_max: u32) -> (u32, u32) {
    let k = (taille_max as f64 / largeur.max(hauteur) as f64).min(1.0);
    (((largeur as f64 * k).round() as u32).max(1), ((hauteur as f64 * k).round() as u32).max(1))
}

pub fn arguments_ffprobe(chemin: &Path) -> Vec<String> {
    let mut a: Vec<String> = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams"].iter().map(|s| s.to_string()).collect();
    a.push(chemin.to_string_lossy().into_owned());
    a
}

/// Une image à l'instant `temps`, rotation appliquée (ffmpeg la fait lui-même), réduite à l × h, en RGBA brut.
pub fn arguments_image(chemin: &Path, temps: f64, l: u32, h: u32) -> Vec<String> {
    vec![
        "-v".into(), "error".into(),
        "-ss".into(), format!("{:.3}", temps.max(0.0)),
        "-i".into(), chemin.to_string_lossy().into_owned(),
        "-an".into(), "-sn".into(),
        "-frames:v".into(), "1".into(),
        "-vf".into(), format!("scale={l}:{h}:flags=bicubic,format=rgba"),
        "-f".into(), "rawvideo".into(),
        "pipe:1".into(),
    ]
}

/// En-tête des images renvoyées à l'interface : largeur et hauteur (u32 petit-boutiste), puis les pixels RGBA.
pub fn avec_entete(l: u32, h: u32, pixels: Vec<u8>) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + pixels.len());
    out.extend_from_slice(&l.to_le_bytes());
    out.extend_from_slice(&h.to_le_bytes());
    out.extend(pixels);
    out
}

/// Sortie complète d'un sidecar.
struct Sortie {
    succes: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

/// Lance un sidecar et attend sa fin, en gardant la sortie **octet pour octet**.
/// Deux pièges du plugin shell pour une sortie binaire (pixels) : il lit par défaut ligne par ligne
/// en retirant les sauts de ligne (d'où set_raw_out), et `output()` ajoute un saut de ligne après
/// chaque morceau reçu. On assemble donc les morceaux nous-mêmes.
async fn lancer(app: &tauri::AppHandle, nom: &str, args: Vec<String>) -> Result<Sortie, String> {
    let (mut rx, _enfant) = app
        .shell()
        .sidecar(nom)
        .map_err(|e| format!("{nom} introuvable (lancer tools/get-ffmpeg.ps1) : {e}"))?
        .args(args)
        .set_raw_out(true)
        .spawn()
        .map_err(|e| format!("{nom} ne démarre pas : {e}"))?;
    let mut s = Sortie { succes: false, stdout: Vec::new(), stderr: Vec::new() };
    while let Some(evenement) = rx.recv().await {
        match evenement {
            CommandEvent::Stdout(octets) => s.stdout.extend(octets),
            CommandEvent::Stderr(octets) => s.stderr.extend(octets),
            CommandEvent::Terminated(fin) => s.succes = fin.code == Some(0),
            _ => {}
        }
    }
    Ok(s)
}

async fn sonder(app: &tauri::AppHandle, chemin: &Path) -> Result<InfosVideo, String> {
    let sortie = lancer(app, "ffprobe", arguments_ffprobe(chemin)).await?;
    if !sortie.succes {
        eprintln!("ffprobe : {}", String::from_utf8_lossy(&sortie.stderr));
        return Err(ILLISIBLE.into());
    }
    analyser_ffprobe(&String::from_utf8_lossy(&sortie.stdout))
}

/// Informations d'une vidéo (ffprobe).
#[tauri::command]
pub async fn infos_video(app: tauri::AppHandle, chemin: String) -> Result<InfosVideo, String> {
    let p = verifier_chemin(&chemin)?;
    sonder(&app, p).await
}

/// Image de la vidéo à l'instant `temps` (secondes), plus grand côté ≤ `taille_max` :
/// en-tête (largeur, hauteur) + pixels RGBA, en binaire brut.
#[tauri::command]
pub async fn image_video(app: tauri::AppHandle, chemin: String, temps: f64, taille_max: u32) -> Result<Response, String> {
    let p = verifier_chemin(&chemin)?;
    let infos = sonder(&app, p).await?;
    let (l, h) = taille_sortie(infos.largeur, infos.hauteur, taille_max.max(1));
    let sortie = lancer(&app, "ffmpeg", arguments_image(p, temps, l, h)).await?;
    let attendu = (l as usize) * (h as usize) * 4;
    if !sortie.succes || sortie.stdout.len() != attendu {
        eprintln!("ffmpeg : {}", String::from_utf8_lossy(&sortie.stderr));
        return Err(if sortie.stdout.is_empty() { "Aucune image à cet instant de la vidéo.".into() } else { ILLISIBLE.into() });
    }
    Ok(Response::new(avec_entete(l, h, sortie.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    const PROBE: &str = r#"{
      "streams": [
        { "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080,
          "sample_aspect_ratio": "1:1", "r_frame_rate": "30000/1001", "avg_frame_rate": "30000/1001",
          "nb_frames": "360", "side_data_list": [{ "side_data_type": "Display Matrix", "rotation": -90 }] },
        { "codec_type": "audio", "codec_name": "aac" }
      ],
      "format": { "duration": "12.012000" }
    }"#;

    #[test]
    fn analyse_une_video_de_telephone() {
        let i = analyser_ffprobe(PROBE).unwrap();
        assert_eq!((i.largeur, i.hauteur, i.rotation), (1080, 1920, 270));
        assert!((i.cadence - 29.97).abs() < 0.01);
        assert_eq!((i.images, i.son, i.codec.as_str()), (360, true, "h264"));
        assert!((i.duree - 12.012).abs() < 1e-9);
    }

    #[test]
    fn pixels_non_carres_et_valeurs_manquantes() {
        let j = r#"{ "streams": [ { "codec_type": "video", "codec_name": "mpeg2video", "width": 720, "height": 576,
            "sample_aspect_ratio": "16:15", "r_frame_rate": "0/0", "avg_frame_rate": "25/1", "tags": { "rotate": "180" } } ],
          "format": { "duration": "2.0" } }"#;
        let i = analyser_ffprobe(j).unwrap();
        assert_eq!((i.largeur, i.hauteur, i.rotation, i.images, i.son), (768, 576, 180, 50, false));
        assert_eq!(i.cadence, 25.0);
    }

    #[test]
    fn refuse_ce_qui_n_est_pas_une_video() {
        assert!(analyser_ffprobe("pas du json").is_err());
        assert_eq!(analyser_ffprobe(r#"{ "streams": [ { "codec_type": "audio" } ], "format": {} }"#).unwrap_err(), "Ce fichier ne contient pas d'images vidéo.");
        // pochette d'album (image attachée) : pas une vidéo
        assert!(analyser_ffprobe(r#"{ "streams": [ { "codec_type": "video", "width": 600, "height": 600, "disposition": { "attached_pic": 1 } } ], "format": {} }"#).is_err());
    }

    #[test]
    fn taille_de_sortie_comme_fit_image() {
        assert_eq!(taille_sortie(3840, 2160, 1800), (1800, 1013));
        assert_eq!(taille_sortie(1080, 1920, 1800), (1013, 1800));
        assert_eq!(taille_sortie(640, 360, 1800), (640, 360));
    }

    #[test]
    fn chemins_refuses() {
        assert!(verifier_chemin("-i.mp4").is_err());
        assert!(verifier_chemin("http://exemple.fr/v.mp4").is_err());
        assert!(verifier_chemin("C:/n-existe-pas/clip.mp4").is_err());
        assert!(verifier_chemin(&std::env::temp_dir().join("x.txt").to_string_lossy()).is_err());
    }

    // ---- avec les vrais binaires (src-tauri/binaries, téléchargés par tools/get-ffmpeg.ps1) ----
    fn binaire(nom: &str) -> Option<std::path::PathBuf> {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!("{nom}-x86_64-pc-windows-msvc.exe"));
        p.is_file().then_some(p)
    }

    #[test]
    fn vraie_video_generee_par_ffmpeg() {
        let (Some(ffmpeg), Some(ffprobe)) = (binaire("ffmpeg"), binaire("ffprobe")) else {
            eprintln!("binaires absents : test sauté (lancer tools/get-ffmpeg.ps1)");
            return;
        };
        let dir = std::env::temp_dir().join("glyphotrame-test-video");
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("mire.mp4");
        // mire 640 × 360, 30 i/s, 2 s, avec son ; puis la même affichée en portrait (rotation 90°)
        let ok = Command::new(&ffmpeg)
            .args(["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2", "-f", "lavfi", "-i", "sine=duration=2",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
            .arg(&clip).status().unwrap().success();
        assert!(ok);
        let tourne = dir.join("mire-portrait.mp4");
        assert!(Command::new(&ffmpeg).args(["-v", "error", "-y", "-display_rotation", "90", "-i"]).arg(&clip).args(["-c", "copy"]).arg(&tourne).status().unwrap().success());

        let sonde = |p: &Path| analyser_ffprobe(&String::from_utf8_lossy(&Command::new(&ffprobe).args(arguments_ffprobe(p)).output().unwrap().stdout)).unwrap();
        let i = sonde(&clip);
        assert_eq!((i.largeur, i.hauteur, i.cadence, i.son, i.codec.as_str()), (640, 360, 30.0, true, "h264"));
        assert!((i.duree - 2.0).abs() < 0.1, "durée {}", i.duree);
        assert_eq!(i.images, 60);
        let r = sonde(&tourne);
        assert_eq!((r.largeur, r.hauteur, r.rotation % 180), (360, 640, 90));

        // une image à 1 s, réduite à 320 px : 320 × 180 × 4 octets, pas toute noire
        let (l, h) = taille_sortie(i.largeur, i.hauteur, 320);
        let px = Command::new(&ffmpeg).args(arguments_image(&clip, 1.0, l, h)).output().unwrap().stdout;
        assert_eq!((l, h, px.len()), (320, 180, 320 * 180 * 4));
        assert!(px.chunks(4).filter(|p| p[0] > 40 || p[1] > 40 || p[2] > 40).count() > 1000);
        assert!(px.chunks(4).all(|p| p[3] == 255));
        // portrait : l'image sort déjà tournée
        let (l2, h2) = taille_sortie(r.largeur, r.hauteur, 320);
        let px2 = Command::new(&ffmpeg).args(arguments_image(&tourne, 1.0, l2, h2)).output().unwrap().stdout;
        assert_eq!((l2, h2, px2.len()), (180, 320, 180 * 320 * 4));
        assert_eq!(&avec_entete(2, 3, vec![9])[..], &[2, 0, 0, 0, 3, 0, 0, 0, 9]);
        std::fs::remove_dir_all(dir).ok();
    }
}
