const $ = (s) => document.querySelector(s);
let proyectoActual = null;

async function api(url, opciones = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || 'Error');
  return datos;
}

function tiempo(s) {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ----- Estado (API key) -----
async function cargarEstado() {
  const e = await api('/api/estado');
  const el = $('#estado');
  if (e.apiKey) {
    el.textContent = `Claude: ${e.modeloClaude} · Whisper: ${e.modeloWhisper}`;
  } else {
    el.textContent = '⚠️ Falta tu API key en el archivo .env';
    el.classList.add('mal');
  }
}

// ----- Lista de proyectos -----
async function cargarProyectos() {
  const lista = await api('/api/proyectos');
  const ul = $('#proyectos');
  ul.innerHTML = '';
  if (!lista.length) ul.innerHTML = '<li class="gris">Aún no hay proyectos</li>';
  for (const p of lista) {
    const li = document.createElement('li');
    li.className = p.id === proyectoActual ? 'activo' : '';
    const icono = p.estado === 'listo' ? '✅' : p.estado === 'error' ? '❌' : '⏳';
    li.innerHTML = `<strong>${icono} ${p.clips} clips</strong> · ${tiempo(p.duracion)}<span class="url"></span>`;
    li.querySelector('.url').textContent = p.entrada;
    li.onclick = () => abrirProyecto(p.id);
    ul.appendChild(li);
  }
}

// ----- Seguir un trabajo -----
async function seguirTrabajo(idTrabajo, titulo) {
  const panel = $('#panelTrabajo');
  panel.classList.remove('oculto');
  $('#tituloTrabajo').textContent = titulo;
  const chip = $('#estadoTrabajo');

  while (true) {
    const t = await api(`/api/trabajos/${idTrabajo}`);
    $('#logs').textContent = t.logs.join('\n') || 'En fila...';
    $('#logs').scrollTop = $('#logs').scrollHeight;
    chip.textContent = t.estado;
    chip.className = `chip ${t.estado}`;
    if (t.estado === 'listo' || t.estado === 'error') return t;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ----- Hacer clips -----
$('#formulario').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = ev.target.querySelector('button');
  boton.disabled = true;
  try {
    const { trabajo, proyectoId } = await api('/api/procesar', {
      method: 'POST',
      body: { entrada: $('#entrada').value, instrucciones: $('#instrucciones').value },
    });
    proyectoActual = proyectoId;
    await cargarProyectos();
    const t = await seguirTrabajo(trabajo, '✂️ Haciendo clips');
    await cargarProyectos();
    await abrirProyecto(proyectoId);
    if (t.estado === 'listo') $('#entrada').value = '';
  } catch (e) {
    alert(e.message);
  } finally {
    boton.disabled = false;
  }
});

// ----- Ver un proyecto -----
async function abrirProyecto(id) {
  proyectoActual = id;
  const p = await api(`/api/proyectos/${id}`);
  $('#vacio').classList.add('oculto');
  $('#proyecto').classList.remove('oculto');
  $('#tituloProyecto').textContent = p.entrada.length > 70 ? p.entrada.slice(0, 70) + '…' : p.entrada;
  $('#infoProyecto').textContent = `${p.clips.length} clips · ${tiempo(p.duracion)} · ${p.estado}${p.error ? ' — ' + p.error : ''}`;

  const grilla = $('#clips');
  grilla.innerHTML = '';
  for (const clip of p.clips) grilla.appendChild(tarjetaClip(p.id, clip));
  cargarProyectos();
}

function tarjetaClip(proyectoId, clip) {
  const nodo = $('#plantillaClip').content.firstElementChild.cloneNode(true);
  const video = nodo.querySelector('video');
  video.src = `${clip.url}?v=${clip.version}`;

  const titulo = nodo.querySelector('.titulo');
  const descripcion = nodo.querySelector('.descripcion');
  titulo.value = clip.titulo;
  descripcion.value = `${clip.descripcion || ''}\n\n${(clip.hashtags || []).join(' ')}`.trim();
  nodo.querySelector('.puntaje').textContent = `⭐ ${clip.puntaje}/10`;
  nodo.querySelector('.meta').textContent =
    `Clip ${clip.numero} · ${clip.duracion}s · versión ${clip.version} · del ${tiempo(clip.receta.inicio)} al ${tiempo(clip.receta.fin)}`;
  nodo.querySelector('.razon').textContent = clip.razon || '';
  nodo.querySelector('.descargar').href = clip.url;
  nodo.querySelector('.deshacer').disabled = !clip.puedeDeshacer;

  const guardarTextos = () =>
    api(`/api/proyectos/${proyectoId}/clips/${clip.numero}`, {
      method: 'PATCH',
      body: { titulo: titulo.value, descripcion: descripcion.value },
    }).catch(() => {});
  titulo.addEventListener('change', guardarTextos);
  descripcion.addEventListener('change', guardarTextos);

  nodo.querySelector('.copiar').onclick = async () => {
    await navigator.clipboard.writeText(`${titulo.value}\n\n${descripcion.value}`);
    nodo.querySelector('.copiar').textContent = '✅ Copiado';
    setTimeout(() => (nodo.querySelector('.copiar').textContent = '📋 Copiar texto'), 1500);
  };

  const aplicar = async (comando) => {
    if (!comando) return;
    nodo.classList.add('ocupado');
    try {
      const { trabajo } = await api(`/api/proyectos/${proyectoId}/clips/${clip.numero}/editar`, {
        method: 'POST',
        body: { comando },
      });
      await seguirTrabajo(trabajo, `🎞️ Editando clip ${clip.numero}: ${comando}`);
      await abrirProyecto(proyectoId);
    } catch (e) {
      alert(e.message);
      nodo.classList.remove('ocupado');
    }
  };

  nodo.querySelectorAll('.atajos button').forEach((b) => (b.onclick = () => aplicar(b.dataset.cmd)));
  nodo.querySelector('.editar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    aplicar(ev.target.querySelector('input').value.trim());
  });

  return nodo;
}

async function iniciar() {
  await cargarEstado();
  const lista = await api('/api/proyectos');
  if (lista.length) await abrirProyecto(lista[0].id);
  else await cargarProyectos();
}

iniciar();
