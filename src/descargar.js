import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { ejecutar } from './procesos.js';

/**
 * FASE 1: consigue el video.
 * - Si le pasas una URL (YouTube, Kick, Twitch, X, TikTok...), lo descarga con yt-dlp.
 * - Si le pasas la ruta de un archivo de tu PC, lo usa directamente.
 * @param {string} entrada URL o ruta local
 * @param {(msg:string)=>void} log
 * @returns {Promise<string>} ruta del video
 */
export async function conseguirVideo(entrada, log = console.log) {
  const limpia = entrada.trim().replace(/^"|"$/g, '');

  if (!/^https?:\/\//i.test(limpia)) {
    const ruta = path.resolve(limpia);
    if (!fs.existsSync(ruta)) throw new Error(`No existe el archivo: ${ruta}`);
    log(`📁 Usando archivo local: ${ruta}`);
    return ruta;
  }

  log('⏬ Descargando video (puede tardar según el tamaño)...');

  const args = [
    '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--restrict-filenames',
    '-o', path.join(config.carpetaVideos, '%(extractor)s-%(id)s.%(ext)s'),
    '--print', 'after_move:filepath',
    '--newline',
    '--progress',
    limpia,
  ];

  let ultimoPorcentaje = -10;
  const { stdout } = await ejecutar('yt-dlp', args, {
    alSalir: (linea) => {
      const m = linea.match(/\[download\]\s+([\d.]+)%/);
      if (m) {
        const p = Math.floor(Number(m[1]));
        if (p >= ultimoPorcentaje + 10) {
          ultimoPorcentaje = p;
          log(`   descargado ${p}%`);
        }
      }
    },
  });

  const ruta = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[') && fs.existsSync(l))
    .pop();

  if (!ruta) throw new Error('La descarga terminó, pero no encontré el archivo descargado.');
  log(`✅ Video descargado: ${path.basename(ruta)}`);
  return ruta;
}
