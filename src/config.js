import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(raiz, '.env'), quiet: true });

function num(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export const config = {
  raiz,
  carpetaVideos: path.join(raiz, 'videos'),
  carpetaClips: path.join(raiz, 'clips'),
  carpetaDatos: path.join(raiz, 'datos'),
  scriptWhisper: path.join(raiz, 'python', 'transcribir.py'),

  apiKey: process.env.ANTHROPIC_API_KEY || '',
  modeloClaude: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  modeloWhisper: process.env.WHISPER_MODEL || 'small',
  idioma: process.env.IDIOMA ?? 'es',
  maxClips: num(process.env.MAX_CLIPS, 6),
  duracionMin: num(process.env.DURACION_MIN, 15),
  duracionMax: num(process.env.DURACION_MAX, 58),
  modoVertical: (process.env.MODO_VERTICAL || 'blur').toLowerCase() === 'crop' ? 'crop' : 'blur',
  subtitulos: (process.env.SUBTITULOS || 'si').toLowerCase() !== 'no',
  puerto: num(process.env.PUERTO, 3000),
  python: process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3'),
};

for (const carpeta of [config.carpetaVideos, config.carpetaClips, config.carpetaDatos]) {
  fs.mkdirSync(carpeta, { recursive: true });
}

export function verificarApiKey() {
  if (!config.apiKey || config.apiKey.includes('PEGA_AQUI')) {
    throw new Error(
      'Falta tu API key de Anthropic. Abre el archivo .env y pon ANTHROPIC_API_KEY=sk-ant-...'
    );
  }
}
