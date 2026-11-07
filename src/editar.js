import fs from 'node:fs';
import { pedirJSON } from './claude.js';
import { renderizarClip } from './render.js';
import { coloresDisponibles } from './subtitulos.js';
import { cargarProyecto, guardarProyecto, cargarTranscripcion, todasLasPalabras } from './proyectos.js';
import { rutaClip } from './pipeline.js';

const SISTEMA = `Eres el asistente de edición de video de Señor Juan. Él te pide cambios a un clip vertical
(Short) en español, con sus palabras, y tú devuelves la RECETA del clip actualizada.

La receta controla todo el render. Campos:
- inicio, fin (segundos en el VIDEO ORIGINAL): dónde empieza y termina el clip.
- modo: "blur" (gameplay completo con fondo borroso) o "crop" (recorte al centro, llena la pantalla).
- zoom: 1 a 2 (acerca la imagen).
- subtitulos: true/false.
- colorResaltado: ${coloresDisponibles.join(', ')}.
- posicionSubs: "arriba", "centro" o "abajo".
- mayusculas: true/false.
- gancho: texto grande arriba al inicio del clip ("" para quitarlo). ganchoSegundos: cuánto dura.
- textos: lista de textos extra [{"texto","desde","hasta","posicion"}]. desde/hasta en segundos DEL CLIP FINAL.
- quitarSilencios: true/false. umbralSilencio: segundos mínimos de silencio para cortarlo (0.3 a 2).
- cortesInternos: partes a eliminar [{"desde","hasta"}] en segundos RELATIVOS AL INICIO DEL CLIP (antes de quitar silencios y de cambiar velocidad).
- velocidad: 0.5 a 2.
- volumen: 0 a 3.

Reglas:
- Cambia SOLO lo que pide. Copia el resto igual.
- Para "corta la parte donde digo X", busca X en la transcripción del clip y agrega un corte interno.
- Para "empieza antes/después" o "alarga/acorta", ajusta inicio/fin.
- Si pide algo imposible con estos campos (música, efectos de sonido, stickers, transiciones), no lo
  inventes: deja la receta igual y explícalo en "explicacion".
- Responde SOLO con JSON: {"receta": {...receta completa...}, "explicacion": "qué cambiaste, en una frase"}`;

function limpiarReceta(nueva, anterior, duracionVideo) {
  const r = { ...anterior, ...nueva };
  r.inicio = Math.max(0, Number(r.inicio) || 0);
  r.fin = Math.min(duracionVideo || Infinity, Math.max(r.inicio + 1, Number(r.fin) || anterior.fin));
  r.modo = r.modo === 'crop' ? 'crop' : 'blur';
  r.zoom = Math.min(2, Math.max(1, Number(r.zoom) || 1));
  r.velocidad = Math.min(2, Math.max(0.5, Number(r.velocidad) || 1));
  r.volumen = Math.min(3, Math.max(0, Number(r.volumen ?? 1)));
  r.umbralSilencio = Math.min(2, Math.max(0.3, Number(r.umbralSilencio) || 0.6));
  if (!coloresDisponibles.includes(r.colorResaltado)) r.colorResaltado = anterior.colorResaltado || 'amarillo';
  if (!['arriba', 'centro', 'abajo'].includes(r.posicionSubs)) r.posicionSubs = 'abajo';
  r.textos = Array.isArray(r.textos) ? r.textos.filter((t) => t && t.texto) : [];
  r.cortesInternos = Array.isArray(r.cortesInternos)
    ? r.cortesInternos.filter((c) => c && Number(c.hasta) > Number(c.desde)).map((c) => ({ desde: Number(c.desde), hasta: Number(c.hasta) }))
    : [];
  r.subtitulos = r.subtitulos !== false;
  r.quitarSilencios = !!r.quitarSilencios;
  r.mayusculas = r.mayusculas !== false;
  r.gancho = String(r.gancho || '');
  return r;
}

async function volverARenderizar(proyecto, clip) {
  const palabras = todasLasPalabras(cargarTranscripcion(proyecto.id));
  const anterior = clip.archivo;
  const salida = rutaClip(proyecto.id, clip.numero, clip.titulo, clip.version + 1);
  const { duracion } = await renderizarClip({
    rutaVideo: proyecto.video,
    receta: clip.receta,
    palabras,
    medidas: proyecto.medidas,
    tieneAudio: proyecto.tieneAudio !== false,
    salida,
  });
  clip.archivo = salida;
  clip.duracion = duracion;
  clip.version += 1;
  // Borra la versión vieja para no llenar el disco (la receta queda en el historial)
  if (anterior && anterior !== salida && fs.existsSync(anterior)) {
    fs.rmSync(anterior, { force: true });
    fs.rmSync(anterior.replace(/\.mp4$/, '.ass'), { force: true });
  }
  guardarProyecto(proyecto);
  return clip;
}

/**
 * FASE 5: edita un clip con un comando en lenguaje natural.
 * Ejemplos: "quita los silencios", "pon NO PUEDE SER en el segundo 4", "empieza 3 segundos antes",
 *           "subtítulos en verde y en el centro", "deshacer".
 */
export async function editarClip(proyectoId, numeroClip, comando, log = console.log) {
  const proyecto = cargarProyecto(proyectoId);
  const clip = proyecto.clips.find((c) => c.numero === Number(numeroClip));
  if (!clip) throw new Error(`El proyecto no tiene el clip ${numeroClip}.`);

  const texto = comando.trim().toLowerCase();
  if (['deshacer', 'undo', 'atras', 'atrás'].includes(texto)) {
    const previa = clip.historial.pop();
    if (!previa) throw new Error('No hay nada que deshacer.');
    clip.receta = previa;
    log('↩️  Deshaciendo el último cambio...');
    await volverARenderizar(proyecto, clip);
    return { clip, explicacion: 'Volví a la versión anterior.' };
  }

  // Transcripción del pedazo del clip, con tiempos relativos al inicio del clip
  const palabras = todasLasPalabras(cargarTranscripcion(proyectoId))
    .filter((p) => p.fin >= clip.receta.inicio - 15 && p.inicio <= clip.receta.fin + 15)
    .map((p) => `[${(p.inicio - clip.receta.inicio).toFixed(1)}] ${p.texto}`)
    .join(' ');

  log('🤖 Claude está entendiendo tu pedido...');
  const respuesta = await pedirJSON(
    SISTEMA,
    `RECETA ACTUAL:\n${JSON.stringify(clip.receta, null, 2)}

DURACIÓN DEL VIDEO ORIGINAL: ${proyecto.duracion?.toFixed(1)} s
DURACIÓN ACTUAL DEL CLIP: ${clip.duracion} s

TRANSCRIPCIÓN ALREDEDOR DEL CLIP ([segundos relativos al inicio del clip; negativos = antes del clip]):
${palabras || '(sin voz)'}

PEDIDO: ${comando}`
  );

  const nueva = limpiarReceta(respuesta.receta || {}, clip.receta, proyecto.duracion);
  if (JSON.stringify(nueva) === JSON.stringify(clip.receta)) {
    return { clip, explicacion: respuesta.explicacion || 'No hubo cambios.' };
  }

  clip.historial.push(clip.receta);
  if (clip.historial.length > 20) clip.historial.shift();
  clip.receta = nueva;

  log(`🎞️  Renderizando: ${respuesta.explicacion || 'aplicando cambios'}`);
  await volverARenderizar(proyecto, clip);
  return { clip, explicacion: respuesta.explicacion || 'Listo.' };
}

/** Cambia el título/descripción de un clip sin volver a renderizar. */
export function actualizarTextos(proyectoId, numeroClip, { titulo, descripcion }) {
  const proyecto = cargarProyecto(proyectoId);
  const clip = proyecto.clips.find((c) => c.numero === Number(numeroClip));
  if (!clip) throw new Error('Clip no encontrado.');
  if (titulo !== undefined) clip.titulo = String(titulo);
  if (descripcion !== undefined) clip.descripcion = String(descripcion);
  guardarProyecto(proyecto);
  return clip;
}
