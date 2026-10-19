import { useSession } from '../../state/index.js';
import {
  togglePlay, stepFrame, seekFrame, setIn, setOut, resetInOut, toggleLoop,
  frameCount, frameOf, formatDuration
} from '../../state/video.js';
import './VideoBar.css';

const I = {
  prev: <svg viewBox="0 0 16 16"><path d="M4 3v10M13 3 6 8l7 5z" /></svg>,
  next: <svg viewBox="0 0 16 16"><path d="M12 3v10M3 3l7 5-7 5z" /></svg>,
  play: <svg viewBox="0 0 16 16"><path d="M4.5 2.5v11l9-5.5z" /></svg>,
  pause: <svg viewBox="0 0 16 16"><path d="M4.5 3v10M11.5 3v10" /></svg>,
  in: <svg viewBox="0 0 16 16"><path d="M6 2.5H3.5v11H6M8 8h5.5M11 5.5 13.5 8 11 10.5" /></svg>,
  out: <svg viewBox="0 0 16 16"><path d="M10 2.5h2.5v11H10M2.5 8H8M5.5 5.5 8 8l-2.5 2.5" /></svg>,
  loop: <svg viewBox="0 0 16 16"><path d="M3 9V7a3 3 0 0 1 3-3h7M11 2l2 2-2 2M13 7v2a3 3 0 0 1-3 3H3M5 14l-2-2 2-2" /></svg>
};

// Barre de lecture sous l'aperçu (vidéo seulement) : lecture, image par image, curseur de temps,
// points d'entrée et de sortie, boucle. Raccourcis dans state/video.js (onVideoKey).
export default function VideoBar() {
  const video = useSession('video');
  const t = useSession('vTime'), playing = useSession('vPlaying'), vIn = useSession('vIn'), vOut = useSession('vOut');
  const loop = useSession('vLoop'), realFps = useSession('vFps');
  if (!video) return null;
  const { duree } = video.meta, n = frameCount(), cur = Math.min(frameOf(t), n - 1);
  const pct = (s) => (n > 1 ? Math.min(100, (frameOf(s) / (n - 1)) * 100) : 0);
  const ranged = vIn > 0 || vOut < duree;
  return (
    <div className="videobar" role="group" aria-label="Lecture de la vidéo">
      <div className="vbuttons">
        <button type="button" title="Image précédente (←, Maj : 10 images)" aria-label="Image précédente" onClick={() => stepFrame(-1)}>{I.prev}</button>
        <button type="button" className="vplay" title={(playing ? 'Pause' : 'Lecture') + ' (Espace)'} aria-label={playing ? 'Pause' : 'Lecture'}
          aria-pressed={playing} onClick={togglePlay}>{playing ? I.pause : I.play}</button>
        <button type="button" title="Image suivante (→, Maj : 10 images)" aria-label="Image suivante" onClick={() => stepFrame(1)}>{I.next}</button>
      </div>
      <div className="vtime" aria-live="off">
        <b>{formatDuration(t, 2)}</b> / {formatDuration(duree, 2)}
        <span> · image {cur + 1} / {n}</span>
      </div>
      <div className="vtrack" style={{ '--in': pct(vIn) + '%', '--out': pct(vOut) + '%' }}>
        <input type="range" min="0" max={n - 1} step="1" value={cur} aria-label="Position dans la vidéo"
          onChange={(e) => seekFrame(+e.target.value)} />
        <div className={'vrange' + (ranged ? ' on' : '')} aria-hidden="true"></div>
      </div>
      <div className="vbuttons">
        <button type="button" title="Point d'entrée à cette image (I)" onClick={setIn}>{I.in}<span>Entrée</span></button>
        <button type="button" title="Point de sortie à cette image (O)" onClick={setOut}>{I.out}<span>Sortie</span></button>
        <button type="button" title="Lire en boucle entre l'entrée et la sortie (L)" aria-pressed={loop} onClick={toggleLoop}>{I.loop}<span>Boucle</span></button>
      </div>
      <div className="vinfo">
        {ranged && <button type="button" className="vreset" title="Revenir à toute la vidéo" onClick={resetInOut}>
          {formatDuration(vIn, 2)} → {formatDuration(vOut, 2)} ×</button>}
        {playing && realFps > 0 && <span className="vfps">{Math.round(realFps)} i/s affichées</span>}
      </div>
    </div>
  );
}
