import { config } from './config.js';
import { pedirJSON } from './claude.js';
import { formatoTiempo } from './procesos.js';

const SISTEMA = `Eres el editor de Shorts de Señor Juan, un creador venezolano que vive en Guatemala.
Hace clips verticales (TikTok, Reels, YouTube Shorts) para un público latino de 15 años en adelante
que los ve en el celular. Su contenido principal es GTA 6 (gameplay con voz encima), pero también clippea
streams y videos de otros creadores (gaming, podcasts, IRL, reacciones).

Tu trabajo: leer la transcripción con tiempos y los picos de volumen, y escoger los momentos que mejor
funcionan como clip corto. Un buen clip:
- Engancha en los primeros 2 segundos (una frase fuerte, una reacción, algo que pasa de golpe).
- Se entiende solo, sin haber visto el resto del video.
- Tiene un final claro (remate, risa, resultado, revelación). No corta a mitad de frase.
- Momentos locos, graciosos, secretos, datos sorprendentes, reacciones fuertes o explicaciones útiles.

Reglas:
- Usa los tiempos en SEGUNDOS tal como aparecen en la transcripción.
- Empieza un poco antes de la primera palabra del momento y termina después del remate.
- No inventes cosas que no estén en el video. Si algo es rumor, no lo presentes como confirmado.
- Títulos en español latino, cortos, sin clickbait falso, sin emojis.
- Responde SOLO con JSON, sin texto extra.`;

function transcripcionCompacta(segmentos) {
  return segmentos
    .map((s) => `[${s.inicio.toFixed(1)}-${s.fin.toFixed(1)}] ${s.texto}`)
    .join('\n');
}

function dividirEnBloques(segmentos, maxCaracteres = 200000) {
  const bloques = [];
  let actual = [];
  let tamaño = 0;
  for (const s of segmentos) {
    const largo = s.texto.length + 20;
    if (tamaño + largo > maxCaracteres && actual.length) {
      bloques.push(actual);
      actual = [];
      tamaño = 0;
    }
    actual.push(s);
    tamaño += largo;
  }
  if (actual.length) bloques.push(actual);
  return bloques;
}

/** Ajusta el clip a las reglas de duración y a los límites del video. */
function normalizarClip(clip, duracionTotal) {
  let inicio = Math.max(0, Number(clip.inicio) || 0);
  let fin = Math.min(duracionTotal, Number(clip.fin) || inicio + config.duracionMin);
  if (fin - inicio > config.duracionMax) fin = inicio + config.duracionMax;
  if (fin - inicio < config.duracionMin) {
    const falta = config.duracionMin - (fin - inicio);
    inicio = Math.max(0, inicio - falta / 2);
    fin = Math.min(duracionTotal, inicio + config.duracionMin);
  }
  return {
    inicio: Number(inicio.toFixed(2)),
    fin: Number(fin.toFixed(2)),
    titulo: String(clip.titulo || 'Clip').slice(0, 100),
    gancho: String(clip.gancho || '').slice(0, 60),
    descripcion: String(clip.descripcion || ''),
    hashtags: Array.isArray(clip.hashtags) ? clip.hashtags.slice(0, 8) : [],
    puntaje: Number(clip.puntaje) || 5,
    razon: String(clip.razon || ''),
  };
}

function seSolapan(a, b) {
  const solape = Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio);
  return solape > Math.min(a.fin - a.inicio, b.fin - b.inicio) * 0.4;
}

/** Si el video casi no tiene voz, arma clips alrededor de los picos de audio. */
function clipsPorPicos(picos, duracionTotal) {
  const largo = Math.min(config.duracionMax, Math.max(config.duracionMin, 25));
  return [...picos]
    .sort((a, b) => b.fuerza - a.fuerza)
    .slice(0, config.maxClips)
    .map((p, i) =>
      normalizarClip(
        {
          inicio: p.segundo - largo * 0.6,
          fin: p.segundo + largo * 0.4,
          titulo: `Momento ${i + 1}`,
          gancho: '',
          puntaje: Math.min(10, p.fuerza),
          razon: 'Pico fuerte de audio (acción o reacción).',
        },
        duracionTotal
      )
    )
    .sort((a, b) => a.inicio - b.inicio);
}

/**
 * FASE 3: Claude escoge los mejores momentos.
 * @returns {Promise<Array>} lista de clips {inicio, fin, titulo, gancho, ...}
 */
export async function elegirMomentos({ transcripcion, picos, duracionTotal, instrucciones = '', log = console.log }) {
  const segmentos = transcripcion?.segmentos || [];
  const palabras = segmentos.reduce((n, s) => n + s.texto.split(/\s+/).length, 0);

  if (palabras < 30) {
    log('🔇 Casi no hay voz en el video. Armo los clips con los picos de audio.');
    return clipsPorPicos(picos, duracionTotal);
  }

  const bloques = dividirEnBloques(segmentos);
  const porBloque = Math.max(2, Math.ceil((config.maxClips * 1.5) / bloques.length));
  let todos = [];

  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    const desde = bloque[0].inicio;
    const hasta = bloque[bloque.length - 1].fin;
    const picosBloque = picos.filter((p) => p.segundo >= desde && p.segundo <= hasta);
    log(`🤖 Claude está revisando ${bloques.length > 1 ? `la parte ${i + 1}/${bloques.length}` : 'el video'}...`);

    const mensaje = `Duración total del video: ${duracionTotal.toFixed(0)} s (${formatoTiempo(duracionTotal)}).
Escoge hasta ${porBloque} clips de entre ${config.duracionMin} y ${config.duracionMax} segundos.
${instrucciones ? `\nINSTRUCCIONES DEL USUARIO (tienen prioridad): ${instrucciones}\n` : ''}
PICOS DE VOLUMEN (segundo: fuerza vs. volumen normal):
${picosBloque.map((p) => `${p.segundo}s: x${p.fuerza}`).join(', ') || 'ninguno'}

TRANSCRIPCIÓN [inicio-fin en segundos]:
${transcripcionCompacta(bloque)}

Responde con este JSON exacto:
{"clips":[{"inicio":12.5,"fin":48.0,"titulo":"Título corto para el Short","gancho":"Texto de 3 a 6 palabras para poner arriba del video","descripcion":"Descripción de 1 o 2 frases","hashtags":["#gta6"],"puntaje":8,"razon":"Por qué funciona"}]}`;

    const respuesta = await pedirJSON(SISTEMA, mensaje);
    todos.push(...(respuesta.clips || []).map((c) => normalizarClip(c, duracionTotal)));
  }

  // Ordena por puntaje, quita los que se repiten y deja los mejores
  todos.sort((a, b) => b.puntaje - a.puntaje);
  const finales = [];
  for (const c of todos) {
    if (finales.every((f) => !seSolapan(f, c))) finales.push(c);
    if (finales.length >= config.maxClips) break;
  }
  return finales.sort((a, b) => a.inicio - b.inicio);
}
