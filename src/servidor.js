import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { procesarVideo } from './pipeline.js';
import { editarClip, actualizarTextos } from './editar.js';
import { listarProyectos, cargarProyecto, nuevoId } from './proyectos.js';

/**
 * FASE 6: página web local. Abre http://localhost:3000
 * Los trabajos (hacer clips, editar) van en fila, uno a la vez, para no ahogar la laptop.
 */

const app = express();
app.use(express.json());
app.use(express.static(path.join(config.raiz, 'web')));
app.use('/clips', express.static(config.carpetaClips));

// ----- Fila de trabajos -----
const trabajos = new Map();
let fila = Promise.resolve();

function crearTrabajo(tipo, descripcion, tarea) {
  const id = `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const trabajo = { id, tipo, descripcion, estado: 'en fila', logs: [], resultado: null, error: null };
  trabajos.set(id, trabajo);
  const log = (msg) => {
    trabajo.logs.push(msg);
    console.log(msg);
  };
  fila = fila.then(async () => {
    trabajo.estado = 'trabajando';
    try {
      trabajo.resultado = await tarea(log);
      trabajo.estado = 'listo';
    } catch (error) {
      trabajo.estado = 'error';
      trabajo.error = error.message;
      log(`❌ ${error.message}`);
    }
  });
  return trabajo;
}

function urlClip(archivo) {
  const relativo = path.relative(config.carpetaClips, archivo).split(path.sep).join('/');
  return `/clips/${relativo}`;
}

function proyectoParaWeb(p) {
  return {
    ...p,
    clips: (p.clips || []).map((c) => ({ ...c, url: urlClip(c.archivo), historial: undefined, puedeDeshacer: c.historial?.length > 0 })),
  };
}

// ----- API -----
app.get('/api/estado', (req, res) => {
  res.json({
    apiKey: !!config.apiKey && !config.apiKey.includes('PEGA_AQUI'),
    modeloClaude: config.modeloClaude,
    modeloWhisper: config.modeloWhisper,
  });
});

app.get('/api/proyectos', (req, res) => {
  res.json(
    listarProyectos().map((p) => ({
      id: p.id, entrada: p.entrada, estado: p.estado, clips: p.clips.length, duracion: p.duracion,
      portada: p.clips[0] ? urlClip(p.clips[0].archivo) : null,
    }))
  );
});

app.get('/api/proyectos/:id', (req, res) => {
  try {
    res.json(proyectoParaWeb(cargarProyecto(req.params.id)));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post('/api/procesar', (req, res) => {
  const entrada = String(req.body?.entrada || '').trim();
  const instrucciones = String(req.body?.instrucciones || '').trim();
  if (!entrada) return res.status(400).json({ error: 'Pega una URL o la ruta de un video.' });
  const proyectoId = nuevoId();
  const trabajo = crearTrabajo('procesar', entrada, async (log) => {
    const p = await procesarVideo(entrada, { instrucciones, log, id: proyectoId });
    return { proyectoId: p.id };
  });
  res.json({ trabajo: trabajo.id, proyectoId });
});

app.post('/api/proyectos/:id/clips/:n/editar', (req, res) => {
  const comando = String(req.body?.comando || '').trim();
  if (!comando) return res.status(400).json({ error: 'Escribe qué quieres cambiar.' });
  const { id, n } = req.params;
  const trabajo = crearTrabajo('editar', `Clip ${n}: ${comando}`, async (log) => {
    const { explicacion } = await editarClip(id, n, comando, log);
    log(`✅ ${explicacion}`);
    return { proyectoId: id, explicacion };
  });
  res.json({ trabajo: trabajo.id });
});

app.patch('/api/proyectos/:id/clips/:n', (req, res) => {
  try {
    res.json(actualizarTextos(req.params.id, req.params.n, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/trabajos/:id', (req, res) => {
  const t = trabajos.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  res.json(t);
});

app.listen(config.puerto, () => {
  console.log(`\n🎬 LemaClipper listo en http://localhost:${config.puerto}\n   (Ctrl + C para apagarlo)\n`);
});
