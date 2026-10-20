//! Export vidéo (docs/video.md, étape 4). Une session d'export = deux ffmpeg :
//! - un **décodeur** qui lit la plage choisie, à la cadence choisie, et sort les images en RGBA brut ;
//! - un **encodeur** qui reçoit les images rendues (RGBA brut sur son entrée) et, si demandé, reprend
//!   le son de la vidéo d'origine sur la même plage.
//! L'interface lit une image (`export_lire_image`), la rend avec l'effet, la renvoie
//! (`export_ecrire_image`, corps binaire brut) et recommence ; puis `export_fin` ou `export_annuler`.
//! Les arguments de ffmpeg sont construits ici à partir de réglages typés et vérifiés.

use crate::video::{sonder_cache, taille_sortie, verifier_chemin, CacheInfos, InfosVideo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command as StdCommand, Stdio};
use crate::canal::Canal;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri_plugin_shell::ShellExt;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Mp4,
    Mov,
    Webm,
    Png,
    Gif,
}

impl Format {
    /// extension du fichier de sortie (séquence PNG : extension des images)
    pub fn extension(self) -> &'static str {
        match self {
            Format::Mp4 => "mp4",
            Format::Mov => "mov",
            Format::Webm => "webm",
            Format::Png => "png",
            Format::Gif => "gif",
        }
    }
    pub fn transparence(self) -> bool {
        matches!(self, Format::Mov | Format::Webm | Format::Png)
    }
    pub fn son(self) -> bool {
        matches!(self, Format::Mp4 | Format::Mov | Format::Webm)
    }
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Qualite {
    Haute,
    Moyenne,
    Legere,
}

/// Réglages envoyés par l'interface.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReglagesExport {
    /// vidéo d'origine
    pub chemin: String,
    /// fichier de sortie, ou dossier pour une séquence PNG
    pub sortie: String,
    /// séquence PNG : début du nom des images (« nom » → nom_00001.png)
    #[serde(default)]
    pub prefixe: String,
    pub format: Format,
    pub qualite: Qualite,
    /// première image de la plage et nombre d'images, à la cadence d'origine
    pub debut: u32,
    pub images: u32,
    /// images par seconde de la sortie ; 0 = cadence d'origine
    pub cadence: f64,
    /// dimensions de la sortie (paires)
    pub largeur: u32,
    pub hauteur: u32,
    /// taille max des images décodées (comme l'aperçu : taille max de l'image source)
    pub taille_source: u32,
    pub son: bool,
    pub transparent: bool,
}

/// Plan d'un export, calculé à partir des réglages et des informations de la vidéo.
#[derive(Debug, Clone, PartialEq)]
pub struct Plan {
    /// cadence de sortie, écrite pour ffmpeg (« 30000/1001 », « 15 ») et en nombre
    pub cadence: String,
    pub cadence_n: f64,
    /// instant de la première image et durée de la plage (secondes)
    pub debut_t: f64,
    pub duree: f64,
    /// nombre d'images de la sortie
    pub images: u32,
    /// dimensions des images décodées
    pub source_l: u32,
    pub source_h: u32,
    pub son: bool,
    pub transparent: bool,
}

/// Où écrire le résultat.
#[derive(Debug, Clone, PartialEq)]
pub enum Cible {
    Fichier(PathBuf),
    Sequence { dossier: PathBuf, prefixe: String },
}

impl Cible {
    /// motif de sortie pour ffmpeg
    fn motif(&self) -> String {
        match self {
            Cible::Fichier(p) => p.to_string_lossy().into_owned(),
            Cible::Sequence { dossier, prefixe } => dossier.join(format!("{prefixe}_%05d.png")).to_string_lossy().into_owned(),
        }
    }
    /// supprime ce qui a été écrit (export annulé ou raté)
    fn supprimer(&self, images: u32) {
        match self {
            Cible::Fichier(p) => {
                let _ = std::fs::remove_file(p);
            }
            Cible::Sequence { dossier, prefixe } => {
                for n in 1..=images + 2 {
                    let _ = std::fs::remove_file(dossier.join(format!("{prefixe}_{n:05}.png")));
                }
            }
        }
    }
}

/// « 30 » ou « 29.97 » → texte pour ffmpeg
fn texte_cadence(c: f64) -> String {
    let t = format!("{:.3}", c);
    t.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// Vérifie les réglages et calcule le plan (fonction pure, testée).
pub fn planifier(r: &ReglagesExport, infos: &InfosVideo) -> Result<Plan, String> {
    if r.largeur < 2 || r.hauteur < 2 || r.largeur % 2 == 1 || r.hauteur % 2 == 1 || r.largeur > 16384 || r.hauteur > 16384 {
        return Err("Dimensions de sortie invalides.".into());
    }
    if r.images == 0 {
        return Err("La plage à exporter est vide.".into());
    }
    if !(r.cadence == 0.0 || (1.0..=120.0).contains(&r.cadence)) {
        return Err("Cadence invalide.".into());
    }
    let fs = if infos.cadence > 0.0 { infos.cadence } else { 25.0 };
    let total = infos.images.max(1) as u32;
    if r.debut >= total {
        return Err("La plage à exporter est hors de la vidéo.".into());
    }
    let images_src = r.images.min(total - r.debut);
    let duree = images_src as f64 / fs;
    // cadence d'origine : forme exacte de ffprobe si elle est sûre (chiffres et « / »)
    let exacte = !infos.cadence_exacte.is_empty() && infos.cadence_exacte.chars().all(|c| c.is_ascii_digit() || c == '/');
    let (cadence, cadence_n, images) = if r.cadence == 0.0 {
        (if exacte { infos.cadence_exacte.clone() } else { texte_cadence(fs) }, fs, images_src)
    } else {
        (texte_cadence(r.cadence), r.cadence, ((duree * r.cadence).round() as u32).max(1))
    };
    let (source_l, source_h) = taille_sortie(infos.largeur, infos.hauteur, r.taille_source.max(1));
    Ok(Plan {
        cadence,
        cadence_n,
        debut_t: r.debut as f64 / fs,
        duree,
        images,
        source_l,
        source_h,
        son: r.son && infos.son && r.format.son(),
        transparent: r.transparent && r.format.transparence(),
    })
}

/// Vérifie la destination choisie dans la boîte Enregistrer (ou le dossier, pour une séquence PNG).
pub fn verifier_sortie(r: &ReglagesExport, source: &Path) -> Result<Cible, String> {
    let p = PathBuf::from(&r.sortie);
    if !p.is_absolute() {
        return Err("Destination invalide.".into());
    }
    if r.format == Format::Png {
        if !p.is_dir() {
            return Err("Dossier de destination introuvable.".into());
        }
        let prefixe: String = r.prefixe.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').take(60).collect();
        return Ok(Cible::Sequence { dossier: p, prefixe: if prefixe.is_empty() { "image".into() } else { prefixe } });
    }
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    if ext != r.format.extension() {
        return Err(format!("Le fichier doit se terminer par .{}.", r.format.extension()));
    }
    if !p.parent().map(|d| d.is_dir()).unwrap_or(false) {
        return Err("Dossier de destination introuvable.".into());
    }
    let meme = |a: &Path, b: &Path| a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase();
    if meme(&p, source) {
        return Err("La vidéo exportée ne peut pas remplacer la vidéo d'origine.".into());
    }
    Ok(Cible::Fichier(p))
}

fn s<T: ToString>(v: T) -> String {
    v.to_string()
}

/// Décodeur : plage [debut_t, debut_t + duree], cadence de sortie, taille de l'aperçu, RGBA brut.
/// L'instant demandé est reculé d'une demi-image (comme la navigation) pour tomber sur la bonne image ;
/// setpts remet la première image à 0 pour que fps= retombe exactement sur les images d'origine.
pub fn arguments_decodeur(chemin: &Path, plan: &Plan, fs: f64) -> Vec<String> {
    vec![
        s("-v"), s("error"), s("-nostdin"),
        s("-ss"), format!("{:.6}", (plan.debut_t - 0.5 / fs).max(0.0)),
        s("-i"), chemin.to_string_lossy().into_owned(),
        s("-an"), s("-sn"),
        s("-vf"), format!("setpts=PTS-STARTPTS,fps={},scale={}:{}:flags=bicubic,format=rgba", plan.cadence, plan.source_l, plan.source_h),
        s("-frames:v"), s(plan.images),
        s("-f"), s("rawvideo"), s("pipe:1"),
    ]
}

/// Encodeur H.264 disponible dans la build de ffmpeg
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum H264 {
    X264,
    MediaFoundation,
}

/// Encodeur : images RGBA sur l'entrée standard (+ son de la vidéo d'origine), réglages par format.
pub fn arguments_encodeur(r: &ReglagesExport, plan: &Plan, chemin: &Path, cible: &Cible, h264: H264) -> Vec<String> {
    let q = |h: &str, m: &str, l: &str| match r.qualite {
        Qualite::Haute => h.to_string(),
        Qualite::Moyenne => m.to_string(),
        Qualite::Legere => l.to_string(),
    };
    let mut a = vec![
        s("-v"), s("error"), s("-y"),
        s("-f"), s("rawvideo"), s("-pix_fmt"), s("rgba"),
        s("-s"), format!("{}x{}", r.largeur, r.hauteur),
        s("-framerate"), plan.cadence.clone(),
        s("-i"), s("pipe:0"),
    ];
    if plan.son {
        a.extend([s("-ss"), format!("{:.6}", plan.debut_t), s("-t"), format!("{:.6}", plan.images as f64 / plan.cadence_n)]);
        a.extend([s("-i"), chemin.to_string_lossy().into_owned(), s("-map"), s("0:v:0"), s("-map"), s("1:a:0?")]);
    }
    match r.format {
        Format::Mp4 => {
            match h264 {
                H264::X264 => a.extend([s("-c:v"), s("libx264"), s("-preset"), s("medium"), s("-crf"), q("18", "23", "28"), s("-pix_fmt"), s("yuv420p")]),
                H264::MediaFoundation => {
                    // pas de x264 dans la build : encodeur de Windows, qualité par débit
                    let bits = r.largeur as f64 * r.hauteur as f64 * plan.cadence_n * match r.qualite { Qualite::Haute => 0.15, Qualite::Moyenne => 0.08, Qualite::Legere => 0.04 };
                    a.extend([s("-c:v"), s("h264_mf"), s("-b:v"), format!("{}", bits.round() as u64), s("-pix_fmt"), s("nv12")]);
                }
            }
            a.extend([s("-movflags"), s("+faststart")]);
            if plan.son {
                a.extend([s("-c:a"), s("aac"), s("-b:a"), s("192k")]);
            }
        }
        Format::Mov => {
            a.extend([s("-c:v"), s("prores_ks"), s("-profile:v"), s("4"), s("-vendor"), s("apl0"), s("-q:v"), q("4", "9", "13")]);
            a.extend([s("-pix_fmt"), s(if plan.transparent { "yuva444p10le" } else { "yuv444p10le" })]);
            if plan.son {
                a.extend([s("-c:a"), s("pcm_s16le")]);
            }
        }
        Format::Webm => {
            a.extend([s("-c:v"), s("libvpx-vp9"), s("-b:v"), s("0"), s("-crf"), q("30", "34", "40")]);
            a.extend([s("-deadline"), s("good"), s("-cpu-used"), s("4"), s("-row-mt"), s("1")]);
            a.extend([s("-pix_fmt"), s(if plan.transparent { "yuva420p" } else { "yuv420p" })]);
            if plan.son {
                a.extend([s("-c:a"), s("libopus"), s("-b:a"), s("160k")]);
            }
        }
        Format::Png => {
            a.extend([s("-c:v"), s("png"), s("-pix_fmt"), s(if plan.transparent { "rgba" } else { "rgb24" }), s("-start_number"), s("1"), s("-f"), s("image2")]);
        }
        Format::Gif => {
            let (couleurs, tramage) = match r.qualite {
                Qualite::Haute => ("256", "sierra2_4a"),
                Qualite::Moyenne => ("128", "bayer:bayer_scale=3"),
                Qualite::Legere => ("64", "bayer:bayer_scale=5"),
            };
            a.extend([
                s("-filter_complex"),
                format!("[0:v]split[a][b];[a]palettegen=max_colors={couleurs}:stats_mode=diff[p];[b][p]paletteuse=dither={tramage}"),
                s("-loop"), s("0"),
            ]);
        }
    }
    a.push(cible.motif());
    a
}

/* ---------- Sessions ---------- */

/// Texte d'erreur d'un ffmpeg (sortie d'erreur, gardée bornée)
type Journal = Arc<Mutex<String>>;

fn vider_erreurs(mut flux: impl Read + Send + 'static, journal: Journal) {
    std::thread::spawn(move || {
        let mut tampon = [0u8; 4096];
        while let Ok(n) = flux.read(&mut tampon) {
            if n == 0 {
                break;
            }
            let mut j = journal.lock().unwrap();
            if j.len() < 8000 {
                j.push_str(&String::from_utf8_lossy(&tampon[..n]));
            }
        }
    });
}

pub struct Export {
    images: Mutex<Receiver<Vec<u8>>>,
    entree: Mutex<Option<ChildStdin>>,
    processus: Mutex<(Child, Child)>,
    cible: Cible,
    ecrites: AtomicU32,
    erreurs: Journal,
    /// taille d'une image rendue (largeur × hauteur × 4)
    taille_rendu: usize,
    /// mesure (µs cumulées) : attente du décodeur et de l'encodeur (le reste est le transfert)
    attente_decodeur: AtomicU64,
    attente_encodeur: AtomicU64,
    /// canal des pixels (canal.rs) : connexion ouverte (fermée à la fin), export terminé (fin de l'attente)
    connexion: Mutex<Option<std::net::TcpStream>>,
    termine: AtomicBool,
}

impl Export {
    /// image décodée suivante ; None à la fin
    fn lire_decodee(&self) -> Option<Vec<u8>> {
        let t = Instant::now();
        let image = self.images.lock().unwrap().recv().ok();
        self.attente_decodeur.fetch_add(t.elapsed().as_micros() as u64, Ordering::Relaxed);
        image
    }
    /// image rendue → encodeur
    fn ecrire_rendue(&self, pixels: &[u8]) -> Result<(), String> {
        if pixels.len() != self.taille_rendu {
            return Err("Image rendue de taille inattendue.".into());
        }
        let mut entree = self.entree.lock().unwrap();
        let flux = entree.as_mut().ok_or("Export terminé.")?;
        let t = Instant::now();
        if flux.write_all(pixels).is_err() {
            return Err(message_erreur(self));
        }
        self.attente_encodeur.fetch_add(t.elapsed().as_micros() as u64, Ordering::Relaxed);
        self.ecrites.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }
    /// fin de l'export : le canal n'attend plus de connexion, la connexion ouverte est fermée
    fn fermer_canal(&self) {
        self.termine.store(true, Ordering::Relaxed);
        if let Some(c) = self.connexion.lock().unwrap().take() {
            let _ = c.shutdown(std::net::Shutdown::Both);
        }
    }
}

/// Canal des pixels : attend la connexion de l'interface, puis échange les images par le WebSocket local.
fn relier(canal: Canal, e: Arc<Export>) {
    let Ok(flux) = canal.accepter(std::time::Duration::from_secs(30), || e.termine.load(Ordering::Relaxed)) else { return };
    if let Ok(copie) = flux.try_clone() {
        *e.connexion.lock().unwrap() = Some(copie);
    }
    let source = e.clone();
    let _ = crate::canal::servir(flux, e.taille_rendu, move || source.lire_decodee(), |px| e.ecrire_rendue(px).map_err(std::io::Error::other));
    // échange terminé (fin, ou erreur de l'encodeur) : export_fin n'attend plus d'images par ce canal
    e.connexion.lock().unwrap().take();
}

#[derive(Serialize)]
pub struct InfosCanal {
    port: u16,
    jeton: String,
}

#[derive(Default)]
pub struct Exports {
    suivant: AtomicU32,
    sessions: Mutex<HashMap<u32, Arc<Export>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebutExport {
    id: u32,
    /// dimensions des images décodées envoyées à l'interface
    largeur: u32,
    hauteur: u32,
    /// nombre d'images de la sortie, cadence de sortie, instant de la première image
    images: u32,
    cadence: f64,
    debut: f64,
    son: bool,
    transparent: bool,
    /// canal des pixels (WebSocket local) ; absent s'il n'a pas pu s'ouvrir (l'interface passe alors par l'IPC)
    canal: Option<InfosCanal>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinExport {
    chemin: String,
    images: u32,
    /// temps total (ms) passé à attendre le décodeur et l'encodeur (le reste du temps de lecture /
    /// écriture mesuré par l'interface est le transfert entre l'interface et le Rust)
    attente_decodeur: f64,
    attente_encodeur: f64,
}

fn sidecar(app: &tauri::AppHandle, args: Vec<String>) -> Result<StdCommand, String> {
    let c = app.shell().sidecar("ffmpeg").map_err(|e| format!("ffmpeg introuvable : {e}"))?.args(args);
    Ok(c.into())
}

/// Encodeur H.264 de la build (x264 si présent, sinon celui de Windows), cherché une seule fois.
fn encodeur_h264(app: &tauri::AppHandle) -> H264 {
    static CHOIX: OnceLock<H264> = OnceLock::new();
    *CHOIX.get_or_init(|| {
        let liste = sidecar(app, vec![s("-hide_banner"), s("-encoders")])
            .and_then(|mut c| c.stdin(Stdio::null()).stderr(Stdio::null()).output().map_err(|e| e.to_string()))
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        if liste.contains("libx264") || !liste.contains("h264_mf") { H264::X264 } else { H264::MediaFoundation }
    })
}

fn session(exports: &Exports, id: u32) -> Result<Arc<Export>, String> {
    exports.sessions.lock().unwrap().get(&id).cloned().ok_or_else(|| "Export terminé.".into())
}

fn message_erreur(e: &Export) -> String {
    let j = e.erreurs.lock().unwrap();
    let derniere = j.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
    if derniere.is_empty() { "ffmpeg s'est arrêté.".into() } else { format!("ffmpeg : {derniere}") }
}

/// Démarre un export → numéro de session et plan (dimensions des images décodées, nombre d'images…).
#[tauri::command]
pub async fn export_debut(app: tauri::AppHandle, cache: tauri::State<'_, CacheInfos>, exports: tauri::State<'_, Exports>, reglages: ReglagesExport) -> Result<DebutExport, String> {
    let chemin = verifier_chemin(&reglages.chemin)?.to_path_buf();
    let infos = sonder_cache(&app, &cache, &chemin).await?;
    let plan = planifier(&reglages, &infos)?;
    let cible = verifier_sortie(&reglages, &chemin)?;
    let fs = if infos.cadence > 0.0 { infos.cadence } else { 25.0 };
    let app2 = app.clone();
    let h264 = tauri::async_runtime::spawn_blocking(move || encodeur_h264(&app2)).await.map_err(|e| e.to_string())?;

    let erreurs: Journal = Arc::default();
    let mut dec = sidecar(&app, arguments_decodeur(&chemin, &plan, fs))?;
    dec.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut decodeur = dec.spawn().map_err(|e| format!("ffmpeg ne démarre pas : {e}"))?;
    let mut enc = sidecar(&app, arguments_encodeur(&reglages, &plan, &chemin, &cible, h264))?;
    enc.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped());
    let mut encodeur = match enc.spawn() {
        Ok(e) => e,
        Err(e) => {
            let _ = decodeur.kill();
            return Err(format!("ffmpeg ne démarre pas : {e}"));
        }
    };
    vider_erreurs(decodeur.stderr.take().unwrap(), erreurs.clone());
    vider_erreurs(encodeur.stderr.take().unwrap(), erreurs.clone());
    // lecture des images décodées : file bornée (2), le décodeur attend si le rendu est plus lent
    let (tx, rx) = sync_channel::<Vec<u8>>(2);
    let mut sortie = decodeur.stdout.take().unwrap();
    let taille = plan.source_l as usize * plan.source_h as usize * 4;
    std::thread::spawn(move || loop {
        let mut image = vec![0u8; taille];
        if sortie.read_exact(&mut image).is_err() || tx.send(image).is_err() {
            break;
        }
    });
    let id = exports.suivant.fetch_add(1, Ordering::Relaxed) + 1;
    let e = Export {
        images: Mutex::new(rx),
        entree: Mutex::new(encodeur.stdin.take()),
        processus: Mutex::new((decodeur, encodeur)),
        cible,
        ecrites: AtomicU32::new(0),
        erreurs,
        taille_rendu: reglages.largeur as usize * reglages.hauteur as usize * 4,
        attente_decodeur: AtomicU64::new(0),
        attente_encodeur: AtomicU64::new(0),
        connexion: Mutex::new(None),
        termine: AtomicBool::new(false),
    };
    let e = Arc::new(e);
    exports.sessions.lock().unwrap().insert(id, e.clone());
    let canal = crate::canal::ouvrir().ok().map(|c| {
        let infos = InfosCanal { port: c.port, jeton: c.jeton.clone() };
        std::thread::spawn(move || relier(c, e));
        infos
    });
    Ok(DebutExport {
        canal,
        id,
        largeur: plan.source_l,
        hauteur: plan.source_h,
        images: plan.images,
        cadence: plan.cadence_n,
        debut: plan.debut_t,
        son: plan.son,
        transparent: plan.transparent,
    })
}

/// Image décodée suivante (RGBA brut) ; réponse vide quand il n'y en a plus.
#[tauri::command]
pub async fn export_lire_image(exports: tauri::State<'_, Exports>, id: u32) -> Result<Response, String> {
    let e = session(&exports, id)?;
    let image = tauri::async_runtime::spawn_blocking(move || e.lire_decodee()).await.map_err(|e| e.to_string())?;
    Ok(Response::new(image.unwrap_or_default()))
}

/// Image rendue → encodeur. Corps binaire brut (RGBA, largeur × hauteur × 4), numéro dans l'en-tête « id ».
#[tauri::command]
pub async fn export_ecrire_image(exports: tauri::State<'_, Exports>, request: Request<'_>) -> Result<(), String> {
    let id: u32 = request.headers().get("id").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).ok_or("Export inconnu.")?;
    let InvokeBody::Raw(pixels) = request.body() else { return Err("Image attendue en binaire.".into()) };
    let pixels = pixels.clone();
    let e = session(&exports, id)?;
    tauri::async_runtime::spawn_blocking(move || e.ecrire_rendue(&pixels)).await.map_err(|e| e.to_string())?
}

/// Termine l'export : fin du flux d'images, attente de l'encodeur. En cas d'échec, le fichier est supprimé.
/// images : nombre d'images envoyées par l'interface ; par le canal, elles peuvent être encore en route :
/// on attend qu'elles soient toutes écrites avant de fermer l'entrée de l'encodeur.
#[tauri::command]
pub async fn export_fin(exports: tauri::State<'_, Exports>, id: u32, images: Option<u32>) -> Result<FinExport, String> {
    let e = exports.sessions.lock().unwrap().remove(&id).ok_or("Export terminé.")?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(n) = images {
            let t = Instant::now();
            while e.ecrites.load(Ordering::Relaxed) < n && e.connexion.lock().unwrap().is_some() && t.elapsed().as_secs() < 60 {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }
        e.fermer_canal();
        drop(e.entree.lock().unwrap().take());
        let mut p = e.processus.lock().unwrap();
        let fin = p.1.wait();
        let _ = p.0.kill();
        let _ = p.0.wait();
        let ecrites = e.ecrites.load(Ordering::Relaxed);
        if !matches!(fin, Ok(f) if f.success()) || ecrites == 0 {
            e.cible.supprimer(ecrites);
            return Err(message_erreur(&e));
        }
        let chemin = match &e.cible {
            Cible::Fichier(p) => p.to_string_lossy().into_owned(),
            Cible::Sequence { dossier, prefixe } => dossier.join(format!("{prefixe}_00001.png")).to_string_lossy().into_owned(),
        };
        let ms = |a: &AtomicU64| a.load(Ordering::Relaxed) as f64 / 1000.0;
        Ok(FinExport { chemin, images: ecrites, attente_decodeur: ms(&e.attente_decodeur), attente_encodeur: ms(&e.attente_encodeur) })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Annule l'export : processus arrêtés, fichier (ou images) incomplet supprimé.
/// → dernier message d'erreur de ffmpeg (utile si le canal s'est fermé sur une erreur de l'encodeur)
#[tauri::command]
pub async fn export_annuler(exports: tauri::State<'_, Exports>, id: u32) -> Result<Option<String>, String> {
    let Some(e) = exports.sessions.lock().unwrap().remove(&id) else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        e.fermer_canal();
        let message = if e.erreurs.lock().unwrap().trim().is_empty() { None } else { Some(message_erreur(&e)) };
        {
            let mut p = e.processus.lock().unwrap();
            let _ = p.0.kill();
            let _ = p.1.kill();
            let _ = p.0.wait();
            let _ = p.1.wait();
        }
        drop(e.entree.lock().unwrap().take());
        e.cible.supprimer(e.ecrites.load(Ordering::Relaxed));
        message
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn infos() -> InfosVideo {
        InfosVideo { largeur: 1920, hauteur: 1080, duree: 4.0, cadence: 30.0, cadence_exacte: "30/1".into(), images: 120, rotation: 0, son: true, codec: "h264".into() }
    }
    fn reglages(format: Format) -> ReglagesExport {
        ReglagesExport {
            chemin: "C:/v.mp4".into(), sortie: "C:/sortie.mp4".into(), prefixe: "clip".into(), format, qualite: Qualite::Haute,
            debut: 30, images: 60, cadence: 0.0, largeur: 1200, hauteur: 674, taille_source: 1800, son: true, transparent: true,
        }
    }

    #[test]
    fn plan_d_export() {
        let p = planifier(&reglages(Format::Mp4), &infos()).unwrap();
        assert_eq!((p.cadence.as_str(), p.images, p.source_l, p.source_h, p.son, p.transparent), ("30/1", 60, 1800, 1013, true, false));
        assert!((p.debut_t - 1.0).abs() < 1e-9 && (p.duree - 2.0).abs() < 1e-9);
        // 12 i/s sur 2 s : 24 images ; ProRes garde la transparence ; GIF : ni son ni transparence
        let mut r = reglages(Format::Mov);
        r.cadence = 12.0;
        let p = planifier(&r, &infos()).unwrap();
        assert_eq!((p.cadence.as_str(), p.images, p.son, p.transparent), ("12", 24, true, true));
        let p = planifier(&reglages(Format::Gif), &infos()).unwrap();
        assert_eq!((p.son, p.transparent), (false, false));
        // plage au-delà de la fin : raccourcie
        let mut r = reglages(Format::Mp4);
        r.debut = 100;
        assert_eq!(planifier(&r, &infos()).unwrap().images, 20);
        // refus
        for f in [|r: &mut ReglagesExport| r.largeur = 1201, |r: &mut ReglagesExport| r.images = 0, |r: &mut ReglagesExport| r.cadence = 500.0, |r: &mut ReglagesExport| r.debut = 120] {
            let mut r = reglages(Format::Mp4);
            f(&mut r);
            assert!(planifier(&r, &infos()).is_err());
        }
        // cadence exacte douteuse : remplacée par le nombre
        let mut i = infos();
        i.cadence_exacte = "30;x".into();
        assert_eq!(planifier(&reglages(Format::Mp4), &i).unwrap().cadence, "30");
        assert_eq!(texte_cadence(29.97), "29.97");
    }

    #[test]
    fn arguments_par_format() {
        let src = Path::new("C:/v.mp4");
        let r = reglages(Format::Mp4);
        let p = planifier(&r, &infos()).unwrap();
        let a = arguments_encodeur(&r, &p, src, &Cible::Fichier("C:/o.mp4".into()), H264::X264).join(" ");
        assert!(a.contains("-s 1200x674 -framerate 30/1 -i pipe:0 -ss 1.000000 -t 2.000000 -i C:/v.mp4 -map 0:v:0 -map 1:a:0?"), "{a}");
        assert!(a.contains("libx264") && a.contains("-crf 18") && a.contains("yuv420p") && a.contains("-c:a aac") && a.ends_with("C:/o.mp4"));
        let a = arguments_encodeur(&r, &p, src, &Cible::Fichier("C:/o.mp4".into()), H264::MediaFoundation).join(" ");
        assert!(a.contains("h264_mf") && !a.contains("libx264"));
        let r = reglages(Format::Webm);
        let p = planifier(&r, &infos()).unwrap();
        let a = arguments_encodeur(&r, &p, src, &Cible::Fichier("C:/o.webm".into()), H264::X264).join(" ");
        assert!(a.contains("libvpx-vp9") && a.contains("yuva420p") && a.contains("libopus"));
        let mut r = reglages(Format::Png);
        r.son = true;
        let p = planifier(&r, &infos()).unwrap();
        let c = Cible::Sequence { dossier: "C:/d".into(), prefixe: "clip".into() };
        let a = arguments_encodeur(&r, &p, src, &c, H264::X264).join(" ");
        assert!(!a.contains("-map") && a.contains("-pix_fmt rgba") && a.ends_with("clip_%05d.png"), "{a}");
        let d = arguments_decodeur(src, &p, 30.0).join(" ");
        assert!(d.contains("-ss 0.983333") && d.contains("fps=30/1,scale=1800:1013") && d.contains("-frames:v 60"), "{d}");
    }

    #[test]
    fn destinations_refusees() {
        let dir = std::env::temp_dir();
        let src = dir.join("v.mp4");
        let mut r = reglages(Format::Mp4);
        r.sortie = "relatif.mp4".into();
        assert!(verifier_sortie(&r, &src).is_err());
        r.sortie = dir.join("o.mov").to_string_lossy().into_owned();
        assert!(verifier_sortie(&r, &src).is_err());
        r.sortie = dir.join("dossier-absent-xyz").join("o.mp4").to_string_lossy().into_owned();
        assert!(verifier_sortie(&r, &src).is_err());
        r.sortie = src.to_string_lossy().to_uppercase();
        assert!(verifier_sortie(&r, &src).is_err());
        r.sortie = dir.join("o.mp4").to_string_lossy().into_owned();
        assert!(verifier_sortie(&r, &src).is_ok());
        let mut r = reglages(Format::Png);
        r.sortie = dir.to_string_lossy().into_owned();
        r.prefixe = "../../mal/nom".into();
        assert_eq!(verifier_sortie(&r, &src).unwrap(), Cible::Sequence { dossier: dir.clone(), prefixe: "malnom".into() });
    }

    fn binaire(nom: &str) -> Option<PathBuf> {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!("{nom}-x86_64-pc-windows-msvc.exe"));
        p.is_file().then_some(p)
    }

    /// Décodeur et encodeur de vrais ffmpeg, branchés comme dans l'application (pixels inversés au milieu).
    #[test]
    fn chaine_complete_avec_son() {
        let (Some(ffmpeg), Some(ffprobe)) = (binaire("ffmpeg"), binaire("ffprobe")) else { return };
        let dir = std::env::temp_dir().join("glyphotrame-test-export");
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("mire.mp4");
        assert!(Command::new(&ffmpeg)
            .args(["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2", "-f", "lavfi", "-i", "sine=duration=2",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"])
            .arg(&clip).status().unwrap().success());
        let sonde = |p: &Path| crate::video::analyser_ffprobe(&String::from_utf8_lossy(&Command::new(&ffprobe).args(crate::video::arguments_ffprobe(p)).output().unwrap().stdout)).unwrap();
        let infos = sonde(&clip);
        let image_seule = |n: u32| Command::new(&ffmpeg).args(crate::video::arguments_image(&clip, ((n as f64) - 0.5).max(0.0) / 30.0, 160, 90)).output().unwrap().stdout;

        for (format, cadence, attendu) in [(Format::Mp4, 0.0, 30u32), (Format::Webm, 15.0, 15), (Format::Mov, 0.0, 30), (Format::Gif, 15.0, 15), (Format::Png, 0.0, 30)] {
            let sortie = if format == Format::Png { dir.clone() } else { dir.join(format!("sortie.{}", format.extension())) };
            let r = ReglagesExport {
                chemin: clip.to_string_lossy().into_owned(), sortie: sortie.to_string_lossy().into_owned(), prefixe: "seq".into(), format,
                qualite: Qualite::Moyenne, debut: 15, images: 30, cadence, largeur: 160, hauteur: 90, taille_source: 160, son: true, transparent: true,
            };
            let plan = planifier(&r, &infos).unwrap();
            assert_eq!(plan.images, attendu);
            let cible = verifier_sortie(&r, &clip).unwrap();
            // décodeur : les images décodées sont les images 15, 16… de la vidéo (à 15 i/s : 15, 17, 19…)
            let mut flux = Command::new(&ffmpeg).args(arguments_decodeur(&clip, &plan, 30.0)).output().unwrap().stdout;
            let images = crate::video::decouper(&mut flux, 160 * 90 * 4);
            assert_eq!((images.len(), flux.len()), (attendu as usize, 0), "{format:?}");
            let pas = if cadence == 0.0 { 1 } else { 2 };
            for k in [0usize, 1, 7] {
                assert!(images[k] == image_seule(15 + pas * k as u32), "{format:?} : image {k} décalée");
            }
            // encodeur : images « rendues » (inversées, alpha 50 % à gauche) sur l'entrée standard
            let mut enc = Command::new(&ffmpeg).args(arguments_encodeur(&r, &plan, &clip, &cible, H264::X264))
                .stdin(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
            let mut entree = enc.stdin.take().unwrap();
            for im in &images {
                let px: Vec<u8> = im.chunks(4).enumerate().flat_map(|(i, p)| [255 - p[0], 255 - p[1], 255 - p[2], if i % 160 < 80 { 128 } else { 255 }]).collect();
                entree.write_all(&px).unwrap();
            }
            drop(entree);
            let fin = enc.wait_with_output().unwrap();
            assert!(fin.status.success(), "{format:?} : {}", String::from_utf8_lossy(&fin.stderr));
            if format == Format::Png {
                assert!(dir.join(format!("seq_{:05}.png", attendu)).is_file() && !dir.join(format!("seq_{:05}.png", attendu + 1)).exists());
                cible.supprimer(attendu);
                assert!(!dir.join("seq_00001.png").exists());
                continue;
            }
            // vérification par ffprobe : dimensions, nombre d'images, son, transparence
            let json: serde_json::Value = serde_json::from_slice(&Command::new(&ffprobe)
                .args(["-v", "error", "-count_frames", "-print_format", "json", "-show_streams", "-show_format"]).arg(&sortie).output().unwrap().stdout).unwrap();
            let flux = json["streams"].as_array().unwrap();
            let v = flux.iter().find(|s| s["codec_type"] == "video").unwrap();
            assert_eq!((v["width"].as_u64(), v["height"].as_u64()), (Some(160), Some(90)), "{format:?}");
            assert_eq!(v["nb_read_frames"].as_str().and_then(|n| n.parse::<u32>().ok()), Some(attendu), "{format:?}");
            assert_eq!(flux.iter().any(|s| s["codec_type"] == "audio"), format.son(), "{format:?} : son");
            let pix = v["pix_fmt"].as_str().unwrap_or("");
            match format {
                Format::Mov => assert!(pix.starts_with("yuva444"), "ProRes sans alpha : {pix}"),
                Format::Webm => assert_eq!(v["tags"]["alpha_mode"].as_str().or(v["tags"]["ALPHA_MODE"].as_str()), Some("1"), "WebM sans alpha"),
                _ => {}
            }
            if format.son() {
                let duree: f64 = json["format"]["duration"].as_str().unwrap().parse().unwrap();
                assert!((duree - 1.0).abs() < 0.1, "{format:?} : durée {duree}");
            }
        }
        std::fs::remove_dir_all(dir).ok();
    }
}
