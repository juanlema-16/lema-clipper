import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/** Cada video procesado es un "proyecto" guardado en datos/<id>/proyecto.json */

export function nuevoId() {
  const f = new Date();
  const fecha = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
  const hora = `${String(f.getHours()).padStart(2, '0')}${String(f.getMinutes()).padStart(2, '0')}${String(f.getSeconds()).padStart(2, '0')}`;
  return `${fecha}-${hora}`;
}

export function carpetaProyecto(id) {
  const carpeta = path.join(config.carpetaDatos, id);
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

export function carpetaClipsProyecto(id) {
  const carpeta = path.join(config.carpetaClips, id);
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

export function guardarProyecto(proyecto) {
  const archivo = path.join(carpetaProyecto(proyecto.id), 'proyecto.json');
  fs.writeFileSync(archivo, JSON.stringify(proyecto, null, 2));
  return proyecto;
}

export function cargarProyecto(id) {
  const archivo = path.join(config.carpetaDatos, id, 'proyecto.json');
  if (!fs.existsSync(archivo)) throw new Error(`No existe el proyecto "${id}".`);
  return JSON.parse(fs.readFileSync(archivo, 'utf-8'));
}

export function cargarTranscripcion(id) {
  const archivo = path.join(config.carpetaDatos, id, 'transcripcion.json');
  return fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf-8')) : { segmentos: [] };
}

export function listarProyectos() {
  if (!fs.existsSync(config.carpetaDatos)) return [];
  return fs
    .readdirSync(config.carpetaDatos)
    .filter((id) => fs.existsSync(path.join(config.carpetaDatos, id, 'proyecto.json')))
    .map((id) => {
      try {
        return cargarProyecto(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

/** Todas las palabras de la transcripción en una sola lista. */
export function todasLasPalabras(transcripcion) {
  return (transcripcion.segmentos || []).flatMap((s) =>
    s.palabras && s.palabras.length ? s.palabras : [{ inicio: s.inicio, fin: s.fin, texto: s.texto }]
  );
}
