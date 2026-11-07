import fs from 'node:fs';
import path from 'node:path';
import { ejecutar } from './procesos.js';
import { generarASS } from './subtitulos.js';

/** Receta por defecto de un clip. Todas las ediciones cambian esta receta y se vuelve a renderizar. */
export function recetaInicial(clip, config) {
  return {
    inicio: clip.inicio,
    fin: clip.fin,
    modo: config.modoVertical,
    subtitulos: config.subtitulos,
    colorResaltado: 'amarillo',
    posicionSubs: 'abajo',
    mayusculas: true,
    gancho: clip.gancho || '',
    ganchoSegundos: 3.5,
    textos: [],
    quitarSilencios: false,
    umbralSilencio: 0.6,
    cortesInternos: [],
    velocidad: 1,
    volumen: 1,
    zoom: 1,
  };
}

/** Busca silencios reales del audio dentro del clip (ffmpeg silencedetect). */
async function detectarSilencios(rutaVideo, inicio, duracion, minimo) {
  const { stderr } = await ejecutar('ffmpeg', [
    '-hide_banner', '-ss', String(inicio), '-t', String(duracion), '-i', rutaVideo,
    '-vn', '-af', `silencedetect=noise=-32dB:d=${minimo}`, '-f', 'null', '-',
  ]);
  const silencios = [];
  let abierto = null;
  for (const linea of stderr.split(/\r?\n/)) {
    const a = linea.match(/silence_start:\s*([\d.]+)/);
    const b = linea.match(/silence_end:\s*([\d.]+)/);
    if (a) abierto = Number(a[1]);
    if (b && abierto !== null) {
      silencios.push({ desde: abierto, hasta: Number(b[1]) });
      abierto = null;
    }
  }
  if (abierto !== null) silencios.push({ desde: abierto, hasta: duracion });
  // Deja un pequeño respiro a cada lado para que no suene cortado
  return silencios
    .map((s) => ({ desde: s.desde + 0.12, hasta: s.hasta - 0.12 }))
    .filter((s) => s.hasta - s.desde > 0.15);
}

/** Calcula qué partes del clip se conservan (relativas al inicio del clip). */
function tramosConservados(duracion, cortes) {
  const ordenados = cortes
    .map((c) => ({ desde: Math.max(0, c.desde), hasta: Math.min(duracion, c.hasta) }))
    .filter((c) => c.hasta > c.desde)
    .sort((a, b) => a.desde - b.desde);

  const tramos = [];
  let cursor = 0;
  for (const c of ordenados) {
    if (c.desde > cursor) tramos.push({ desde: cursor, hasta: c.desde });
    cursor = Math.max(cursor, c.hasta);
  }
  if (cursor < duracion) tramos.push({ desde: cursor, hasta: duracion });
  return tramos.filter((t) => t.hasta - t.desde > 0.05);
}

/** Convierte un tiempo del clip original al tiempo del clip ya editado (o null si se cortó). */
function mapearTiempo(t, tramos, velocidad) {
  let acumulado = 0;
  for (const tramo of tramos) {
    if (t >= tramo.desde && t <= tramo.hasta) return (acumulado + (t - tramo.desde)) / velocidad;
    acumulado += tramo.hasta - tramo.desde;
  }
  return null;
}

function filtroVertical(receta, medidas) {
  const esVertical = medidas.alto > medidas.ancho;
  const zoom = Math.min(2, Math.max(1, Number(receta.zoom) || 1));

  if (esVertical) {
    return `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  }
  if (receta.modo === 'crop') {
    const alto = Math.round(1920 * zoom);
    return `scale=-2:${alto},crop=1080:1920,setsar=1`;
  }
  // blur: gameplay casi completo al centro + fondo borroso
  const altoFrente = Math.round(760 * zoom);
  return (
    `split=2[fondo][frente];` +
    `[fondo]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:3,eq=brightness=-0.08[fondo2];` +
    `[frente]scale=-2:${altoFrente},crop='min(iw,1080)':ih[frente2];` +
    `[fondo2][frente2]overlay=(W-w)/2:(H-h)/2,setsar=1`
  );
}

/**
 * FASE 4 y 5: renderiza un clip vertical según su receta.
 * @param {object} p { rutaVideo, receta, palabras (tiempos absolutos), medidas, tieneAudio, salida }
 */
export async function renderizarClip({ rutaVideo, receta, palabras, medidas, tieneAudio = true, salida }) {
  const duracionBase = Math.max(1, receta.fin - receta.inicio);
  const velocidad = Math.min(2, Math.max(0.5, Number(receta.velocidad) || 1));

  let cortes = [...(receta.cortesInternos || [])];
  if (receta.quitarSilencios && tieneAudio) {
    cortes = cortes.concat(
      await detectarSilencios(rutaVideo, receta.inicio, duracionBase, Number(receta.umbralSilencio) || 0.6)
    );
  }
  const tramos = tramosConservados(duracionBase, cortes);
  if (!tramos.length) throw new Error('Con esos cortes no queda nada del clip.');

  const duracionFinal = tramos.reduce((n, t) => n + (t.hasta - t.desde), 0) / velocidad;

  // Subtítulos: tiempos del clip editado
  const palabrasClip = (palabras || [])
    .map((p) => {
      const ini = mapearTiempo(p.inicio - receta.inicio, tramos, velocidad);
      const fin = mapearTiempo(Math.min(p.fin, receta.fin) - receta.inicio, tramos, velocidad);
      return ini === null ? null : { ...p, inicio: ini, fin: fin ?? ini + 0.3 };
    })
    .filter(Boolean);

  const carpeta = path.dirname(salida);
  fs.mkdirSync(carpeta, { recursive: true });
  const nombreASS = path.basename(salida, '.mp4') + '.ass';
  fs.writeFileSync(path.join(carpeta, nombreASS), generarASS({ palabras: palabrasClip, duracion: duracionFinal, receta }));

  // ----- Armado del filtro de FFmpeg -----
  const partes = [];
  const n = tramos.length;
  tramos.forEach((t, i) => {
    partes.push(`[0:v]trim=start=${t.desde.toFixed(3)}:end=${t.hasta.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    if (tieneAudio) partes.push(`[0:a]atrim=start=${t.desde.toFixed(3)}:end=${t.hasta.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  });

  const entradasConcat = tramos.map((_, i) => (tieneAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
  partes.push(`${entradasConcat}concat=n=${n}:v=1:a=${tieneAudio ? 1 : 0}[vc]${tieneAudio ? '[ac]' : ''}`);

  partes.push(`[vc]setpts=PTS/${velocidad},${filtroVertical(receta, medidas)}[vv]`);
  // El filtro de subtítulos usa una ruta relativa (cwd = carpeta del clip) para evitar problemas en Windows
  partes.push(`[vv]subtitles=${nombreASS}[vout]`);

  if (tieneAudio) {
    const volumen = Math.min(3, Math.max(0, Number(receta.volumen) || 1));
    partes.push(`[ac]atempo=${velocidad},volume=${volumen},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
  }

  const args = [
    '-y', '-hide_banner', '-v', 'error',
    '-ss', String(receta.inicio), '-t', String(duracionBase),
    '-i', rutaVideo,
    '-filter_complex', partes.join(';'),
    '-map', '[vout]',
    ...(tieneAudio ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000'] : ['-an']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-movflags', '+faststart',
    path.basename(salida),
  ];

  await ejecutar('ffmpeg', args, { cwd: carpeta });
  return { salida, duracion: Number(duracionFinal.toFixed(2)) };
}
