//! Canal des pixels de l'export vidéo (docs/video.md, étape 6) : WebSocket local minimal, sans dépendance.
//!
//! Pourquoi : sous Windows, l'IPC de Tauri plafonne pour de gros corps binaires. En 1080p, une image fait
//! 8 Mo dans chaque sens : ≈ 115 ms pour la recevoir et ≈ 175 ms pour la renvoyer, soit 85 % du temps de
//! l'export. Un WebSocket sur 127.0.0.1 fait l'aller-retour en ≈ 30 ms (mesures dans docs/notes.md).
//!
//! Sécurité : écoute sur 127.0.0.1 seulement, port choisi par le système, une seule connexion acceptée,
//! jeton aléatoire de 128 bits dans l'adresse (transmis à l'interface par l'IPC), origine vérifiée.
//!
//! Protocole : messages binaires seulement. Le Rust envoie les images décodées (RGBA brut), au plus AVANCE
//! images d'avance sur les images rendues reçues (l'image suivante arrive pendant le rendu de la courante) ;
//! un message vide signale la fin. L'interface renvoie chaque image rendue (RGBA brut).

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::mpsc::sync_channel;
use std::time::{Duration, Instant};

/// images décodées envoyées d'avance
pub const AVANCE: usize = 3;

pub struct Canal {
    pub port: u16,
    pub jeton: String,
    ecoute: TcpListener,
}

/// Ouvre l'écoute sur 127.0.0.1 (port libre) avec un jeton aléatoire.
pub fn ouvrir() -> io::Result<Canal> {
    let ecoute = TcpListener::bind(("127.0.0.1", 0))?;
    let mut octets = [0u8; 16];
    getrandom::fill(&mut octets).map_err(|e| io::Error::other(e.to_string()))?;
    let jeton = octets.iter().map(|b| format!("{b:02x}")).collect();
    Ok(Canal { port: ecoute.local_addr()?.port(), jeton, ecoute })
}

impl Canal {
    /// Attend la connexion de l'interface (au plus `delai`, ou jusqu'à ce que `abandon()` soit vrai).
    /// Une connexion sans le bon jeton ou d'une autre origine est refusée, et l'attente continue.
    pub fn accepter(self, delai: Duration, abandon: impl Fn() -> bool) -> io::Result<TcpStream> {
        self.ecoute.set_nonblocking(true)?;
        let t = Instant::now();
        loop {
            match self.ecoute.accept() {
                Ok((flux, _)) => {
                    flux.set_nonblocking(false)?;
                    if poignee_de_main(&flux, &self.jeton).is_ok() {
                        return Ok(flux);
                    }
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    if t.elapsed() > delai || abandon() {
                        return Err(io::Error::new(io::ErrorKind::TimedOut, "l'interface ne s'est pas connectée"));
                    }
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(e) => return Err(e),
            }
        }
    }
}

/// Origines de l'application : http://localhost:1420 (développement), http://tauri.localhost (Windows),
/// tauri://localhost (macOS). Une page web ouverte dans un navigateur a une autre origine.
fn origine_permise(origine: &str) -> bool {
    let hote = origine.split("://").nth(1).unwrap_or("").split(['/', ':']).next().unwrap_or("");
    matches!(hote, "localhost" | "127.0.0.1" | "tauri.localhost")
}

/// Poignée de main WebSocket (RFC 6455) : chemin « /jeton », origine, clé → réponse 101.
fn poignee_de_main(flux: &TcpStream, jeton: &str) -> io::Result<()> {
    flux.set_read_timeout(Some(Duration::from_secs(2)))?;
    let refus = |m: &str| io::Error::new(io::ErrorKind::PermissionDenied, m.to_string());
    // en-têtes limités à 8 Kio ; le client n'envoie rien d'autre avant la réponse
    let mut lecteur = BufReader::new(flux.take(8192));
    let mut ligne = String::new();
    lecteur.read_line(&mut ligne)?;
    let mut morceaux = ligne.split_whitespace();
    let chemin_ok = morceaux.next() == Some("GET") && morceaux.next() == Some(format!("/{jeton}").as_str());
    let (mut cle, mut origine_ok, mut upgrade) = (None, true, false);
    loop {
        ligne.clear();
        if lecteur.read_line(&mut ligne)? == 0 {
            return Err(refus("en-têtes incomplets"));
        }
        let l = ligne.trim_end();
        if l.is_empty() {
            break;
        }
        if let Some((nom, valeur)) = l.split_once(':') {
            let v = valeur.trim();
            match nom.trim().to_ascii_lowercase().as_str() {
                "sec-websocket-key" => cle = Some(v.to_string()),
                "origin" => origine_ok = origine_permise(v),
                "upgrade" => upgrade = v.eq_ignore_ascii_case("websocket"),
                _ => {}
            }
        }
    }
    let mut f = flux;
    let Some(cle) = cle.filter(|_| chemin_ok && origine_ok && upgrade) else {
        let _ = f.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return Err(refus("connexion refusée"));
    };
    write!(f, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n", cle_acceptee(&cle))?;
    flux.set_read_timeout(None)
}

/// Sec-WebSocket-Accept : base64(SHA-1(clé + GUID du protocole))
pub fn cle_acceptee(cle: &str) -> String {
    base64(&sha1(format!("{cle}258EAFA5-E914-47DA-95CA-C5AB0DC85B11").as_bytes()))
}

fn sha1(donnees: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let mut m = donnees.to_vec();
    m.push(0x80);
    while m.len() % 64 != 56 {
        m.push(0);
    }
    m.extend_from_slice(&((donnees.len() as u64) * 8).to_be_bytes());
    for bloc in m.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([bloc[4 * i], bloc[4 * i + 1], bloc[4 * i + 2], bloc[4 * i + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let [mut a, mut b, mut c, mut d, mut e] = h;
        for (i, wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(*wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = t;
        }
        for (x, y) in h.iter_mut().zip([a, b, c, d, e]) {
            *x = x.wrapping_add(y);
        }
    }
    let mut out = [0u8; 20];
    for (i, x) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&x.to_be_bytes());
    }
    out
}

fn base64(d: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::new();
    for c in d.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            s.push(if i <= c.len() { T[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    s
}

/// Message reçu : Some(contenu) pour un message binaire (fragments réassemblés), None à la fermeture.
/// max : taille maximale d'un message (une image).
pub fn lire_message(flux: &mut impl Read, max: usize) -> io::Result<Option<Vec<u8>>> {
    let invalide = |m: &str| io::Error::new(io::ErrorKind::InvalidData, m.to_string());
    let mut message = Vec::new();
    loop {
        let mut tete = [0u8; 2];
        match flux.read_exact(&mut tete) {
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            r => r?,
        }
        let (fin, code, masque) = (tete[0] & 0x80 != 0, tete[0] & 0x0f, tete[1] & 0x80 != 0);
        let mut longueur = (tete[1] & 0x7f) as u64;
        if longueur == 126 {
            let mut b = [0u8; 2];
            flux.read_exact(&mut b)?;
            longueur = u16::from_be_bytes(b) as u64;
        } else if longueur == 127 {
            let mut b = [0u8; 8];
            flux.read_exact(&mut b)?;
            longueur = u64::from_be_bytes(b);
        }
        let mut cle = [0u8; 4];
        if masque {
            flux.read_exact(&mut cle)?;
        }
        if message.len() as u64 + longueur > max as u64 {
            return Err(invalide("message trop long"));
        }
        let debut = message.len();
        // premier fragment : tampon alloué déjà à zéro (resize remplit octet par octet, lent sans optimisation)
        if debut == 0 {
            message = vec![0u8; longueur as usize];
        } else {
            message.resize(debut + longueur as usize, 0);
        }
        flux.read_exact(&mut message[debut..])?;
        if masque {
            demasquer(&mut message[debut..], cle);
        }
        match code {
            0x8 => return Ok(None),
            // ping / pong : ignorés (le navigateur n'en envoie pas de lui-même)
            0x9 | 0xA => message.truncate(debut),
            0x0 | 0x2 if fin => return Ok(Some(message)),
            0x0 | 0x2 => {}
            _ => return Err(invalide("message inattendu")),
        }
    }
}

/// Les messages du client sont masqués (XOR avec une clé de 4 octets) : par mots de 8 octets alignés,
/// assez rapide même sans optimisation (npm run tauri dev).
fn demasquer(d: &mut [u8], cle: [u8; 4]) {
    // SAFETY : tout motif de bits est un u64 valide ; align_to_mut ne rend que des mots alignés
    let (debut, mots, fin) = unsafe { d.align_to_mut::<u64>() };
    for (i, b) in debut.iter_mut().enumerate() {
        *b ^= cle[i % 4];
    }
    // les mots commencent à l'octet debut.len() du message : clé décalée d'autant
    let p = debut.len();
    let k: [u8; 8] = std::array::from_fn(|i| cle[(p + i) % 4]);
    let c8 = u64::from_ne_bytes(k);
    for m in mots.iter_mut() {
        *m ^= c8;
    }
    let q = p + mots.len() * 8;
    for (i, b) in fin.iter_mut().enumerate() {
        *b ^= cle[(q + i) % 4];
    }
}

/// Message binaire du serveur (non masqué).
pub fn ecrire_message(flux: &mut impl Write, contenu: &[u8]) -> io::Result<()> {
    let n = contenu.len();
    let mut tete = vec![0x82u8];
    if n < 126 {
        tete.push(n as u8);
    } else if n <= 0xffff {
        tete.push(126);
        tete.extend_from_slice(&(n as u16).to_be_bytes());
    } else {
        tete.push(127);
        tete.extend_from_slice(&(n as u64).to_be_bytes());
    }
    flux.write_all(&tete)?;
    flux.write_all(contenu)
}

/// Relie la connexion aux deux ffmpeg : `source` donne les images décodées (None à la fin), `puits` reçoit
/// les images rendues. Rend quand l'interface ferme la connexion, ou à la première erreur (connexion fermée).
pub fn servir(
    flux: TcpStream,
    max: usize,
    mut source: impl FnMut() -> Option<Vec<u8>> + Send + 'static,
    mut puits: impl FnMut(&[u8]) -> io::Result<()>,
) -> io::Result<()> {
    flux.set_nodelay(true)?;
    // un jeton par image envoyée d'avance, rendu à chaque image rendue reçue
    let (jetons, jetons_recus) = sync_channel::<()>(AVANCE);
    for _ in 0..AVANCE {
        let _ = jetons.try_send(());
    }
    let mut sortie = flux.try_clone()?;
    let envoi = std::thread::spawn(move || -> io::Result<()> {
        while jetons_recus.recv().is_ok() {
            match source() {
                Some(image) => ecrire_message(&mut sortie, &image)?,
                None => return ecrire_message(&mut sortie, &[]),
            }
        }
        Ok(())
    });
    let mut entree = flux;
    let r = loop {
        match lire_message(&mut entree, max) {
            Ok(Some(px)) if !px.is_empty() => {
                if let Err(e) = puits(&px) {
                    break Err(e);
                }
                let _ = jetons.try_send(());
            }
            Ok(Some(_)) => {}
            Ok(None) => break Ok(()),
            Err(e) => break Err(e),
        }
    };
    let _ = entree.shutdown(Shutdown::Both);
    drop(jetons);
    let _ = envoi.join();
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cle_de_la_rfc_6455() {
        assert_eq!(cle_acceptee("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"a"), "YQ==");
    }

    #[test]
    fn demasquage_a_toute_position() {
        let cle = [0x12, 0x34, 0x56, 0x78];
        let source: Vec<u8> = (0..203u32).map(|i| (i * 7) as u8).collect();
        for decalage in 0..9 {
            let mut d = source[decalage..].to_vec();
            demasquer(&mut d, cle);
            let attendu: Vec<u8> = source[decalage..].iter().enumerate().map(|(i, b)| b ^ cle[i % 4]).collect();
            assert_eq!(d, attendu, "décalage {decalage}");
            // dans un tampon non aligné
            let mut tampon = vec![0u8; 1];
            tampon.extend_from_slice(&source[decalage..]);
            demasquer(&mut tampon[1..], cle);
            assert_eq!(&tampon[1..], &attendu[..]);
        }
    }

    #[test]
    fn origines() {
        for o in ["http://localhost:1420", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", "http://127.0.0.1:1420"] {
            assert!(origine_permise(o), "{o}");
        }
        for o in ["https://exemple.fr", "http://localhost.exemple.fr", "null", ""] {
            assert!(!origine_permise(o), "{o}");
        }
    }

    // client WebSocket minimal (messages masqués, en un ou plusieurs fragments)
    fn client(port: u16, chemin: &str, origine: &str) -> io::Result<TcpStream> {
        let mut c = TcpStream::connect(("127.0.0.1", port))?;
        write!(c, "GET {chemin} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: {origine}\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")?;
        let mut r = BufReader::new(c.try_clone()?);
        let mut l = String::new();
        r.read_line(&mut l)?;
        if !l.contains("101") {
            return Err(io::Error::other(l));
        }
        // le navigateur vérifie la clé de réponse
        let mut cle_ok = false;
        loop {
            l.clear();
            r.read_line(&mut l)?;
            if l.trim().is_empty() {
                break;
            }
            cle_ok |= l.trim() == "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
        }
        assert!(cle_ok, "clé de réponse");
        Ok(c)
    }
    fn envoyer(c: &mut TcpStream, d: &[u8], fragments: usize) {
        let cle = [0x12, 0x34, 0x56, 0x78];
        let pas = d.len().div_ceil(fragments).max(1);
        let parts: Vec<&[u8]> = if d.is_empty() { vec![d] } else { d.chunks(pas).collect() };
        for (i, p) in parts.iter().enumerate() {
            let code = if i == 0 { 0x2 } else { 0x0 };
            let fin = if i + 1 == parts.len() { 0x80 } else { 0 };
            let mut tete = vec![fin | code, 0x80 | 127];
            tete.extend_from_slice(&(p.len() as u64).to_be_bytes());
            tete.extend_from_slice(&cle);
            let masque: Vec<u8> = p.iter().enumerate().map(|(k, b)| b ^ cle[k % 4]).collect();
            c.write_all(&tete).unwrap();
            c.write_all(&masque).unwrap();
        }
    }

    #[test]
    fn jeton_et_origine_verifies() {
        let canal = ouvrir().unwrap();
        let (port, jeton) = (canal.port, canal.jeton.clone());
        assert_eq!(jeton.len(), 32);
        let attente = std::thread::spawn(move || canal.accepter(Duration::from_secs(5), || false));
        assert!(client(port, "/mauvais", "http://localhost:1420").is_err());
        assert!(client(port, &format!("/{jeton}"), "https://exemple.fr").is_err());
        assert!(client(port, &format!("/{jeton}"), "http://tauri.localhost").is_ok());
        assert!(attente.join().unwrap().is_ok());
        // délai dépassé
        let canal = ouvrir().unwrap();
        assert!(canal.accepter(Duration::from_millis(50), || false).is_err());
    }

    #[test]
    fn images_echangees_dans_l_ordre_avec_avance_bornee() {
        const N: u8 = 6;
        const TAILLE: usize = 300_007; // taille impaire : reste du démasquage 8 octets par 8
        let canal = ouvrir().unwrap();
        let (port, jeton) = (canal.port, canal.jeton.clone());
        let envoyees = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
        let compteur = envoyees.clone();
        let serveur = std::thread::spawn(move || {
            let flux = canal.accepter(Duration::from_secs(5), || false).unwrap();
            let mut n = 0u8;
            let source = move || {
                if n == N {
                    return None;
                }
                n += 1;
                compteur.store(n, std::sync::atomic::Ordering::SeqCst);
                Some(vec![n; TAILLE])
            };
            let mut recues = Vec::new();
            let r = servir(flux, TAILLE, source, |px: &[u8]| {
                recues.push(px.to_vec());
                Ok(())
            });
            (r, recues)
        });
        let mut c = client(port, &format!("/{jeton}"), "http://localhost:1420").unwrap();
        let mut images = Vec::new();
        loop {
            let m = lire_message(&mut c, TAILLE).unwrap().unwrap();
            if m.is_empty() {
                break;
            }
            // jamais plus de AVANCE images d'avance sur celles renvoyées
            std::thread::sleep(Duration::from_millis(20));
            assert!(envoyees.load(std::sync::atomic::Ordering::SeqCst) as usize <= images.len() + 1 + AVANCE);
            let rendu: Vec<u8> = m.iter().map(|b| 255 - b).collect();
            envoyer(&mut c, &rendu, 1 + images.len() % 3);
            images.push(m[0]);
        }
        assert_eq!(images, (1..=N).collect::<Vec<_>>());
        c.shutdown(Shutdown::Both).unwrap();
        let (r, recues) = serveur.join().unwrap();
        assert!(r.is_ok());
        assert_eq!(recues.len(), N as usize);
        for (k, px) in recues.iter().enumerate() {
            assert_eq!(px.len(), TAILLE);
            assert!(px.iter().all(|&b| b == 255 - (k as u8 + 1)), "image {k}");
        }
    }
}
