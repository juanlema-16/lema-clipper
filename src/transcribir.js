import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { ejecutar, ejecutarBinario } from './procesos.js';

/** Duración del video en segundos (usa ffprobe). */
export async function duracionVideo(rutaVideo) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', rutaVideo,
  ]);
  return Number(stdout.trim()) || 0;
}

/** Ancho y alto del video. */
export async function medidasVideo(rutaVideo) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', rutaVideo,
  ]);
  const [ancho, alto] = stdout.trim().split('x').map(Number);
  return { ancho: ancho || 1920, alto: alto || 1080 };
}

/** Extrae el audio en WAV mono 16 kHz (lo que Whisper necesita). */
export async function extraerAudio(rutaVideo, carpetaTrabajo) {
  const wav = path.join(carpetaTrabajo, 'audio.wav');
  await ejecutar('ffmpeg', ['-y', '-v', 'error', '-i', rutaVideo, '-vn', '-ac', '1', '-ar', '16000', wav]);
  return wav;
}

/**
 * FASE 2: transcribe con Whisper. Guarda el resultado en transcripcion.json
 * y lo reutiliza si ya existe (así no transcribes dos veces el mismo video).
 */
export async function transcribir(rutaVideo, carpetaTrabajo, log = console.log) {
  const salida = path.join(carpetaTrabajo, 'transcripcion.json');
  if (fs.existsSync(salida)) {
    log('📝 Transcripción encontrada, la reutilizo.');
    return JSON.parse(fs.readFileSync(salida, 'utf-8'));
  }

  log('🎧 Extrayendo audio...');
  const wav = await extraerAudio(rutaVideo, carpetaTrabajo);

  log(`📝 Transcribiendo con Whisper (${config.modeloWhisper}). En videos largos tarda bastante, tranquilo.`);
  await ejecutar(
    config.python,
    [config.scriptWhisper, wav, salida, config.modeloWhisper, config.idioma || ''],
    {
      alSalir: (linea) => {
        if (linea.startsWith('PROGRESO')) log(`   ${linea.replace('PROGRESO ', '')}`);
      },
    }
  );

  fs.rmSync(wav, { force: true });
  return JSON.parse(fs.readFileSync(salida, 'utf-8'));
}

/**
 * Mide el volumen del audio cada segundo y devuelve los momentos más fuertes
 * (gritos, explosiones, risas). Sirve para que Claude no se pierda la acción.
 */
export async function picosDeAudio(rutaVideo, cantidad = 25) {
  const muestrasPorSeg = 4000;
  const pcm = await ejecutarBinario('ffmpeg', [
    '-v', 'error', '-i', rutaVideo, '-vn', '-ac', '1', '-ar', String(muestrasPorSeg), '-f', 's16le', '-',
  ]);

  const total = Math.floor(pcm.length / 2);
  const segundos = Math.floor(total / muestrasPorSeg);
  const volumen = new Array(segundos).fill(0);

  for (let s = 0; s < segundos; s++) {
    let suma = 0;
    for (let i = 0; i < muestrasPorSeg; i++) {
      const v = pcm.readInt16LE((s * muestrasPorSeg + i) * 2) / 32768;
      suma += v * v;
    }
    volumen[s] = Math.sqrt(suma / muestrasPorSeg);
  }

  if (!segundos) return [];
  const ordenado = [...volumen].sort((a, b) => a - b);
  const mediana = ordenado[Math.floor(segundos / 2)] || 0.0001;

  // Picos locales, separados al menos 10 s entre sí
  const candidatos = volumen
    .map((v, s) => ({ segundo: s, fuerza: v / Math.max(mediana, 0.0001) }))
    .sort((a, b) => b.fuerza - a.fuerza);

  const elegidos = [];
  for (const c of candidatos) {
    if (c.fuerza < 1.8) break;
    if (elegidos.every((e) => Math.abs(e.segundo - c.segundo) >= 10)) elegidos.push(c);
    if (elegidos.length >= cantidad) break;
  }
  return elegidos
    .sort((a, b) => a.segundo - b.segundo)
    .map((e) => ({ segundo: e.segundo, fuerza: Number(e.fuerza.toFixed(1)) }));
}
