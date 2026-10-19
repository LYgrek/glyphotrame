//! Vidéo (docs/video.md) : informations (ffprobe) et image à un instant donné (ffmpeg).
//! ffmpeg / ffprobe sont des « sidecars » lancés uniquement d'ici, avec des arguments construits
//! côté Rust ; le chemin reçu de l'interface est vérifié (absolu, fichier existant, extension vidéo).

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::async_runtime::{self, channel, Mutex as AsyncMutex, Receiver};
use tauri_plugin_shell::process::CommandChild;
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
#[derive(Serialize, Debug, PartialEq, Clone)]
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
        "-ss".into(), format!("{:.6}", temps.max(0.0)),
        "-i".into(), chemin.to_string_lossy().into_owned(),
        "-an".into(), "-sn".into(),
        "-frames:v".into(), "1".into(),
        "-vf".into(), format!("scale={l}:{h}:flags=bicubic,format=rgba"),
        "-f".into(), "rawvideo".into(),
        "pipe:1".into(),
    ]
}

/// Lecture continue à partir de `temps` : toutes les images, réduites à l × h, en RGBA brut.
pub fn arguments_lecture(chemin: &Path, temps: f64, l: u32, h: u32) -> Vec<String> {
    let mut a = arguments_image(chemin, temps, l, h);
    let i = a.iter().position(|x| x == "-frames:v").unwrap();
    a.drain(i..i + 2);
    a
}

/// Retire du tampon les images complètes (`taille` octets chacune) ; le reste attend la suite du flux.
pub fn decouper(tampon: &mut Vec<u8>, taille: usize) -> Vec<Vec<u8>> {
    let mut images = Vec::new();
    while taille > 0 && tampon.len() >= taille {
        let reste = tampon.split_off(taille);
        images.push(std::mem::replace(tampon, reste));
    }
    images
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

/// Informations déjà lues, par chemin et date de modification : ffprobe n'est relancé que si le
/// fichier change (déplacer le curseur de temps demande une image à chaque fois).
#[derive(Default)]
pub struct CacheInfos(Mutex<HashMap<PathBuf, (Option<SystemTime>, InfosVideo)>>);

async fn sonder_cache(app: &tauri::AppHandle, cache: &CacheInfos, chemin: &Path) -> Result<InfosVideo, String> {
    let date = std::fs::metadata(chemin).and_then(|m| m.modified()).ok();
    if let Some((d, infos)) = cache.0.lock().unwrap().get(chemin) {
        if *d == date {
            return Ok(infos.clone());
        }
    }
    let infos = sonder(app, chemin).await?;
    cache.0.lock().unwrap().insert(chemin.to_path_buf(), (date, infos.clone()));
    Ok(infos)
}

/// Informations d'une vidéo (ffprobe).
#[tauri::command]
pub async fn infos_video(app: tauri::AppHandle, cache: tauri::State<'_, CacheInfos>, chemin: String) -> Result<InfosVideo, String> {
    let p = verifier_chemin(&chemin)?;
    sonder_cache(&app, &cache, p).await
}

/// Image de la vidéo à l'instant `temps` (secondes), plus grand côté ≤ `taille_max` :
/// en-tête (largeur, hauteur) + pixels RGBA, en binaire brut.
#[tauri::command]
pub async fn image_video(app: tauri::AppHandle, cache: tauri::State<'_, CacheInfos>, chemin: String, temps: f64, taille_max: u32) -> Result<Response, String> {
    let p = verifier_chemin(&chemin)?;
    let infos = sonder_cache(&app, &cache, p).await?;
    let (l, h) = taille_sortie(infos.largeur, infos.hauteur, taille_max.max(1));
    let sortie = lancer(&app, "ffmpeg", arguments_image(p, temps, l, h)).await?;
    let attendu = (l as usize) * (h as usize) * 4;
    if !sortie.succes || sortie.stdout.len() != attendu {
        eprintln!("ffmpeg : {}", String::from_utf8_lossy(&sortie.stderr));
        return Err(if sortie.stdout.is_empty() { "Aucune image à cet instant de la vidéo.".into() } else { ILLISIBLE.into() });
    }
    Ok(Response::new(avec_entete(l, h, sortie.stdout)))
}

/* ---------- Lecture continue (aperçu) ---------- */

/// Une session de lecture : un ffmpeg qui décode en continu, une tâche qui découpe son flux en images.
/// La file d'images est bornée (2) et le plugin shell transmet la sortie par un canal de capacité 1 :
/// si l'interface lit moins vite, ffmpeg attend ; la mémoire reste stable.
pub struct Lecture {
    enfant: Option<CommandChild>,
    images: Receiver<Vec<u8>>,
    l: u32,
    h: u32,
    suivante: u32,
}

#[derive(Default)]
pub struct Lectures {
    suivant: AtomicU32,
    sessions: Mutex<HashMap<u32, Arc<AsyncMutex<Lecture>>>>,
}

/// Démarre une lecture à l'instant `temps`, images de plus grand côté ≤ `taille_max` → numéro de session.
#[tauri::command]
pub async fn lecture_debut(app: tauri::AppHandle, cache: tauri::State<'_, CacheInfos>, lectures: tauri::State<'_, Lectures>, chemin: String, temps: f64, taille_max: u32) -> Result<u32, String> {
    let p = verifier_chemin(&chemin)?;
    let infos = sonder_cache(&app, &cache, p).await?;
    let (l, h) = taille_sortie(infos.largeur, infos.hauteur, taille_max.max(1));
    let (mut flux, enfant) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg introuvable : {e}"))?
        .args(arguments_lecture(p, temps, l, h))
        .set_raw_out(true)
        .spawn()
        .map_err(|e| format!("ffmpeg ne démarre pas : {e}"))?;
    let (tx, rx) = channel::<Vec<u8>>(2);
    let taille = (l as usize) * (h as usize) * 4;
    async_runtime::spawn(async move {
        let mut tampon = Vec::with_capacity(taille * 2);
        while let Some(evenement) = flux.recv().await {
            match evenement {
                CommandEvent::Stdout(octets) => {
                    tampon.extend(octets);
                    for image in decouper(&mut tampon, taille) {
                        if tx.send(image).await.is_err() {
                            return; // session terminée
                        }
                    }
                }
                CommandEvent::Stderr(octets) => eprintln!("ffmpeg (lecture) : {}", String::from_utf8_lossy(&octets)),
                CommandEvent::Terminated(_) => break,
                _ => {}
            }
        }
    });
    let id = lectures.suivant.fetch_add(1, Ordering::Relaxed) + 1;
    let session = Lecture { enfant: Some(enfant), images: rx, l, h, suivante: 0 };
    lectures.sessions.lock().unwrap().insert(id, Arc::new(AsyncMutex::new(session)));
    Ok(id)
}

/// Prochaine image de la session dont le numéro (depuis le début de la session) est ≥ `cible` :
/// les images en retard sont sautées ici, sans passer par l'interface.
/// En-tête (largeur, hauteur, numéro) + pixels RGBA ; réponse vide à la fin de la vidéo.
#[tauri::command]
pub async fn lecture_image(lectures: tauri::State<'_, Lectures>, id: u32, cible: u32) -> Result<Response, String> {
    let session = lectures.sessions.lock().unwrap().get(&id).cloned().ok_or("Lecture terminée.")?;
    let mut s = session.lock().await;
    loop {
        match s.images.recv().await {
            Some(image) => {
                let n = s.suivante;
                s.suivante += 1;
                if n < cible {
                    continue;
                }
                let mut out = avec_entete(s.l, s.h, Vec::with_capacity(4 + image.len()));
                out.extend_from_slice(&n.to_le_bytes());
                out.extend(image);
                return Ok(Response::new(out));
            }
            None => return Ok(Response::new(Vec::new())),
        }
    }
}

/// Arrête une lecture (ffmpeg arrêté, session oubliée).
#[tauri::command]
pub async fn lecture_fin(lectures: tauri::State<'_, Lectures>, id: u32) -> Result<(), String> {
    let session = lectures.sessions.lock().unwrap().remove(&id);
    if let Some(session) = session {
        let mut s = session.lock().await;
        if let Some(enfant) = s.enfant.take() {
            let _ = enfant.kill();
        }
        s.images.close();
    }
    Ok(())
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

    #[test]
    fn decoupe_le_flux_en_images() {
        let mut t: Vec<u8> = (0..10).collect();
        let images = decouper(&mut t, 4);
        assert_eq!(images, vec![vec![0, 1, 2, 3], vec![4, 5, 6, 7]]);
        assert_eq!(t, vec![8, 9]); // reste en attente de la suite
        t.extend([10, 11]);
        assert_eq!(decouper(&mut t, 4), vec![vec![8, 9, 10, 11]]);
        assert!(t.is_empty());
        let a = arguments_lecture(Path::new("C:/v.mp4"), 1.5, 320, 180);
        assert!(!a.contains(&"-frames:v".to_string()));
        assert_eq!(a[a.iter().position(|x| x == "-ss").unwrap() + 1], "1.500000");
    }

    // ---- avec les vrais binaires (src-tauri/binaries, téléchargés par tools/get-ffmpeg.ps1) ----

    #[test]
    fn lecture_continue_et_image_exacte() {
        let Some(ffmpeg) = binaire("ffmpeg") else { return };
        let dir = std::env::temp_dir().join("glyphotrame-test-lecture");
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("mire.mp4");
        assert!(Command::new(&ffmpeg)
            .args(["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p"])
            .arg(&clip).status().unwrap().success());
        let taille = 160 * 90 * 4;
        // lecture continue depuis 1 s : 30 images
        let mut flux = Command::new(&ffmpeg).args(arguments_lecture(&clip, 1.0, 160, 90)).output().unwrap().stdout;
        let images = decouper(&mut flux, taille);
        assert_eq!((images.len(), flux.len()), (30, 0));
        // depuis 0 : 60 images ; l'image n demandée seule à (n − ½) / cadence est identique, octet pour octet
        let mut tout = Command::new(&ffmpeg).args(arguments_lecture(&clip, 0.0, 160, 90)).output().unwrap().stdout;
        let toutes = decouper(&mut tout, taille);
        assert_eq!(toutes.len(), 60);
        for n in [0u32, 1, 2, 17, 31, 59] {
            let t = ((n as f64) - 0.5).max(0.0) / 30.0;
            let seule = Command::new(&ffmpeg).args(arguments_image(&clip, t, 160, 90)).output().unwrap().stdout;
            assert!(seule == toutes[n as usize], "image {n} : la recherche n'est pas exacte");
            assert!(n == 0 || toutes[n as usize] != toutes[n as usize - 1], "images {n} et {} identiques : test sans valeur", n - 1);
        }
        std::fs::remove_dir_all(dir).ok();
    }
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
