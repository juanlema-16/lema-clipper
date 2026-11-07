import { spawn } from 'node:child_process';

/**
 * Ejecuta un programa externo (ffmpeg, yt-dlp, python...) y devuelve su salida.
 * @param {string} comando
 * @param {string[]} args
 * @param {object} opciones { cwd, alSalir(linea), mostrarErrores }
 */
export function ejecutar(comando, args, opciones = {}) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, args, {
      cwd: opciones.cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proceso.stdout.on('data', (d) => {
      const texto = d.toString();
      stdout += texto;
      if (opciones.alSalir) texto.split(/\r?\n/).filter(Boolean).forEach(opciones.alSalir);
    });

    proceso.stderr.on('data', (d) => {
      const texto = d.toString();
      stderr += texto;
      if (opciones.alError) texto.split(/\r?\n/).filter(Boolean).forEach(opciones.alError);
    });

    proceso.on('error', (err) => {
      reject(new Error(`No se pudo ejecutar "${comando}". ¿Está instalado y en el PATH? (${err.message})`));
    });

    proceso.on('close', (codigo) => {
      if (codigo !== 0) {
        const final = stderr.split(/\r?\n/).filter(Boolean).slice(-8).join('\n');
        return reject(new Error(`"${comando}" terminó con error (código ${codigo}):\n${final}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Ejecuta un proceso y entrega su salida binaria (stdout) como Buffer. */
export function ejecutarBinario(comando, args) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, args, { windowsHide: true });
    const partes = [];
    let stderr = '';
    proceso.stdout.on('data', (d) => partes.push(d));
    proceso.stderr.on('data', (d) => (stderr += d.toString()));
    proceso.on('error', (err) => reject(new Error(`No se pudo ejecutar "${comando}" (${err.message})`)));
    proceso.on('close', (codigo) => {
      if (codigo !== 0) return reject(new Error(`"${comando}" falló:\n${stderr.slice(-800)}`));
      resolve(Buffer.concat(partes));
    });
  });
}

/** Convierte segundos a "mm:ss" o "h:mm:ss". */
export function formatoTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Convierte un texto a un nombre de archivo seguro. */
export function nombreSeguro(texto, max = 50) {
  return (
    String(texto || 'clip')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, max) || 'clip'
  );
}
