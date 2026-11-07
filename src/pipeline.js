import path from 'node:path';
import { config } from './config.js';
import { conseguirVideo } from './descargar.js';
import { transcribir, picosDeAudio, duracionVideo, medidasVideo } from './transcribir.js';
import { elegirMomentos } from './elegir.js';
import { renderizarClip, recetaInicial } from './render.js';
import { ejecutar, nombreSeguro, formatoTiempo } from './procesos.js';
import {
  nuevoId, carpetaProyecto, carpetaClipsProyecto, guardarProyecto, todasLasPalabras,
} from './proyectos.js';

async function tieneAudio(rutaVideo) {
  const { stdout } = await ejecutar('ffprobe', [
    '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', rutaVideo,
  ]);
  return stdout.trim().length > 0;
}

export function rutaClip(proyectoId, numero, titulo, version = 1) {
  const sufijo = version > 1 ? `-v${version}` : '';
  return path.join(
    carpetaClipsProyecto(proyectoId),
    `${String(numero).padStart(2, '0')}-${nombreSeguro(titulo, 40)}${sufijo}.mp4`
  );
}

/**
 * Todo el proceso: URL -> video -> transcripción -> Claude elige -> clips verticales.
 * @param {string} entrada URL o ruta de archivo
 * @param {object} opciones { instrucciones, log, id }
 */
export async function procesarVideo(entrada, { instrucciones = '', log = console.log, id = nuevoId() } = {}) {
  const proyecto = {
    id,
    entrada,
    instrucciones,
    estado: 'procesando',
    creado: new Date().toISOString(),
    clips: [],
  };
  const carpeta = carpetaProyecto(id);
  guardarProyecto(proyecto);

  try {
    // FASE 1
    proyecto.video = await conseguirVideo(entrada, log);
    proyecto.duracion = await duracionVideo(proyecto.video);
    proyecto.medidas = await medidasVideo(proyecto.video);
    proyecto.tieneAudio = await tieneAudio(proyecto.video);
    log(`🎬 Duración: ${formatoTiempo(proyecto.duracion)} · ${proyecto.medidas.ancho}x${proyecto.medidas.alto}`);
    guardarProyecto(proyecto);

    // FASE 2
    const transcripcion = proyecto.tieneAudio
      ? await transcribir(proyecto.video, carpeta, log)
      : { segmentos: [] };
    log('📈 Buscando picos de audio (gritos, explosiones, risas)...');
    const picos = proyecto.tieneAudio ? await picosDeAudio(proyecto.video) : [];

    // FASE 3
    const momentos = await elegirMomentos({
      transcripcion, picos, duracionTotal: proyecto.duracion, instrucciones, log,
    });
    if (!momentos.length) throw new Error('No encontré momentos buenos para clips.');
    log(`⭐ ${momentos.length} momentos elegidos.`);

    // FASE 4
    const palabras = todasLasPalabras(transcripcion);
    for (let i = 0; i < momentos.length; i++) {
      const m = momentos[i];
      const receta = recetaInicial(m, config);
      const salida = rutaClip(id, i + 1, m.titulo);
      log(`✂️  Clip ${i + 1}/${momentos.length}: "${m.titulo}" (${formatoTiempo(m.inicio)} - ${formatoTiempo(m.fin)})`);

      const { duracion } = await renderizarClip({
        rutaVideo: proyecto.video, receta, palabras, medidas: proyecto.medidas,
        tieneAudio: proyecto.tieneAudio, salida,
      });

      proyecto.clips.push({
        numero: i + 1,
        titulo: m.titulo,
        descripcion: m.descripcion,
        hashtags: m.hashtags,
        puntaje: m.puntaje,
        razon: m.razon,
        archivo: salida,
        duracion,
        version: 1,
        receta,
        historial: [],
      });
      guardarProyecto(proyecto);
    }

    proyecto.estado = 'listo';
    guardarProyecto(proyecto);
    log(`🎉 Listo. Tus clips están en: ${carpetaClipsProyecto(id)}`);
    return proyecto;
  } catch (error) {
    proyecto.estado = 'error';
    proyecto.error = error.message;
    guardarProyecto(proyecto);
    throw error;
  }
}
