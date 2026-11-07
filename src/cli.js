import { config } from './config.js';
import { procesarVideo } from './pipeline.js';
import { editarClip } from './editar.js';
import { listarProyectos, cargarProyecto } from './proyectos.js';
import { ejecutar, formatoTiempo } from './procesos.js';

const AYUDA = `
LemaClipper - clips y edición con IA

  npm run clip -- "URL o ruta del video"                 Hace los clips
  npm run clip -- "URL" --pedido "solo momentos graciosos" Le dices qué buscar
  npm run editar -- <proyecto> <clip> "quita los silencios" Edita un clip con IA
  npm run editar -- <proyecto> <clip> deshacer           Deshace el último cambio
  node src/cli.js lista                                  Ve tus proyectos
  node src/cli.js ver <proyecto>                         Ve los clips de un proyecto
  npm run prueba                                         Verifica que todo esté instalado
  npm run web                                            Abre la página en http://localhost:${config.puerto}
`;

async function verificar() {
  console.log('🔍 Verificando instalación...\n');
  const revisiones = [
    ['FFmpeg', 'ffmpeg', ['-version']],
    ['FFprobe', 'ffprobe', ['-version']],
    ['yt-dlp', 'yt-dlp', ['--version']],
    ['Python', config.python, ['--version']],
    ['faster-whisper', config.python, ['-c', 'import faster_whisper; print(faster_whisper.__version__)']],
  ];
  let todoBien = true;
  for (const [nombre, cmd, args] of revisiones) {
    try {
      const { stdout, stderr } = await ejecutar(cmd, args);
      console.log(`  ✅ ${nombre}: ${(stdout || stderr).split(/\r?\n/)[0].slice(0, 60)}`);
    } catch {
      todoBien = false;
      console.log(`  ❌ ${nombre}: no encontrado`);
    }
  }
  const key = config.apiKey && !config.apiKey.includes('PEGA_AQUI');
  console.log(key ? '  ✅ API key de Anthropic configurada' : '  ❌ Falta ANTHROPIC_API_KEY en el archivo .env');
  console.log(todoBien && key ? '\n🎉 Todo listo para usar.' : '\n⚠️  Arregla lo que tiene ❌ (mira el README).');
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);

  if (comando === 'clip') {
    const idx = resto.indexOf('--pedido');
    const instrucciones = idx >= 0 ? resto.slice(idx + 1).join(' ') : '';
    const entrada = (idx >= 0 ? resto.slice(0, idx) : resto).join(' ');
    if (!entrada) return console.log(AYUDA);
    const proyecto = await procesarVideo(entrada, { instrucciones });
    console.log(`\nProyecto: ${proyecto.id}`);
    for (const c of proyecto.clips) console.log(`  ${c.numero}. ${c.titulo} (${c.duracion}s) -> ${c.archivo}`);
    console.log(`\nPara editar: npm run editar -- ${proyecto.id} 1 "quita los silencios"`);
    return;
  }

  if (comando === 'editar') {
    const [proyectoId, numero, ...pedido] = resto;
    if (!proyectoId || !numero || !pedido.length) return console.log(AYUDA);
    const { clip, explicacion } = await editarClip(proyectoId, numero, pedido.join(' '));
    console.log(`\n✅ ${explicacion}\n   Archivo: ${clip.archivo}`);
    return;
  }

  if (comando === 'lista') {
    const proyectos = listarProyectos();
    if (!proyectos.length) return console.log('Todavía no tienes proyectos.');
    for (const p of proyectos) {
      console.log(`${p.id}  [${p.estado}]  ${p.clips.length} clips  ${p.entrada}`);
    }
    return;
  }

  if (comando === 'ver') {
    const p = cargarProyecto(resto[0]);
    console.log(`${p.id} · ${p.entrada} · ${formatoTiempo(p.duracion || 0)}`);
    for (const c of p.clips) {
      console.log(`  ${c.numero}. ${c.titulo} (${c.duracion}s, v${c.version}) ${c.archivo}`);
    }
    return;
  }

  if (comando === 'prueba') return verificar();

  console.log(AYUDA);
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
