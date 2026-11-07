/**
 * Genera subtítulos .ass (estilo Shorts: palabras grandes, la palabra actual resaltada).
 */

const COLORES = {
  amarillo: '&H0000FFFF',
  verde: '&H0004F827',
  rojo: '&H003030FF',
  azul: '&H00FFB040',
  morado: '&H00FF40C0',
  rosa: '&H00B469FF',
  naranja: '&H00008CFF',
  blanco: '&H00FFFFFF',
};

const POSICION_Y = { arriba: 520, centro: 1000, abajo: 1420 };

function tiempoASS(segundos) {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapar(texto) {
  return String(texto).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, ' ');
}

/** Agrupa palabras de 3 en 3 (o menos si hay pausas) para que se lean rápido en el celular. */
function agrupar(palabras, maxPalabras = 3, maxPausa = 0.6) {
  const grupos = [];
  let actual = [];
  for (const p of palabras) {
    const anterior = actual[actual.length - 1];
    if (actual.length >= maxPalabras || (anterior && p.inicio - anterior.fin > maxPausa)) {
      grupos.push(actual);
      actual = [];
    }
    actual.push(p);
  }
  if (actual.length) grupos.push(actual);
  return grupos;
}

/**
 * @param {object} opciones
 *  - palabras: [{inicio, fin, texto}] con tiempos YA relativos al clip final
 *  - duracion: duración final del clip
 *  - receta: subtitulos, colorResaltado, posicionSubs, mayusculas, gancho, ganchoSegundos, textos
 */
export function generarASS({ palabras, duracion, receta }) {
  const resaltado = COLORES[receta.colorResaltado] || COLORES.amarillo;
  const y = POSICION_Y[receta.posicionSubs] || POSICION_Y.abajo;
  const mayus = receta.mayusculas !== false;

  const lineas = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Subs,Arial Black,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1',
    'Style: Gancho,Arial Black,64,&H00000000,&H00000000,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,18,0,8,80,80,230,1',
    'Style: Texto,Arial Black,70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,3,5,60,60,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // Subtítulos palabra por palabra
  if (receta.subtitulos !== false && palabras.length) {
    for (const grupo of agrupar(palabras)) {
      const textos = grupo.map((p) => escapar(mayus ? p.texto.toUpperCase() : p.texto));
      grupo.forEach((palabra, i) => {
        const inicio = palabra.inicio;
        const fin = i < grupo.length - 1 ? grupo[i + 1].inicio : Math.max(palabra.fin, palabra.inicio + 0.25);
        if (fin <= inicio || inicio >= duracion) return;
        const contenido = textos
          .map((t, j) => (j === i ? `{\\c${resaltado}&\\fscx110\\fscy110}${t}{\\c&H00FFFFFF&\\fscx100\\fscy100}` : t))
          .join(' ');
        lineas.push(
          `Dialogue: 1,${tiempoASS(inicio)},${tiempoASS(Math.min(fin, duracion))},Subs,,0,0,0,,{\\pos(540,${y})}${contenido}`
        );
      });
    }
  }

  // Gancho arriba al inicio del clip
  if (receta.gancho) {
    const hasta = Math.min(duracion, Number(receta.ganchoSegundos) || 3.5);
    const texto = escapar(mayus ? receta.gancho.toUpperCase() : receta.gancho);
    lineas.push(`Dialogue: 2,${tiempoASS(0)},${tiempoASS(hasta)},Gancho,,0,0,0,,{\\fad(150,200)}${texto}`);
  }

  // Textos extra que pidas ("pon NO PUEDE SER en el segundo 5")
  for (const t of receta.textos || []) {
    const desde = Math.max(0, Number(t.desde) || 0);
    const hasta = Math.min(duracion, Number(t.hasta) || desde + 2.5);
    if (hasta <= desde) continue;
    const posicion = POSICION_Y[t.posicion] ? t.posicion : 'centro';
    // Si cae donde están los subtítulos, lo sube un poco para que no se encimen
    const ty = POSICION_Y[posicion] - (posicion === (receta.posicionSubs || 'abajo') && receta.subtitulos !== false ? 200 : 0);
    const texto = escapar(mayus ? String(t.texto).toUpperCase() : t.texto);
    lineas.push(`Dialogue: 3,${tiempoASS(desde)},${tiempoASS(hasta)},Texto,,0,0,0,,{\\pos(540,${ty})\\fad(100,150)}${texto}`);
  }

  return lineas.join('\n') + '\n';
}

export const coloresDisponibles = Object.keys(COLORES);
