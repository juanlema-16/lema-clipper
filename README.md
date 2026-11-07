# LemaClipper 🎬

Tu herramienta personal para sacar clips verticales de cualquier video o stream y editarlos con IA.

**Cómo funciona:** pegas una URL → se descarga el video → Whisper transcribe la voz → Claude escoge los mejores momentos → FFmpeg los corta en 9:16 con subtítulos → los editas pidiéndole cambios a Claude en español.

---

## 1. Instalar (una sola vez)

1. Descomprime la carpeta `lema-clipper` en `Documentos`.
2. Doble clic en **`INSTALAR.bat`**. Instala Node.js, FFmpeg, yt-dlp, Python y Whisper (tarda unos minutos).
3. Consigue tu API key en **https://console.anthropic.com** → *API Keys* → *Create Key*. Necesitas cargar saldo (con $5 te alcanza para muchísimos videos).
4. Abre el archivo **`.env`** con el Bloc de notas y pega tu key:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   ```
5. Verifica que todo esté bien:
   ```powershell
   npm run prueba
   ```

> Si `INSTALAR.bat` dice que algo falló, ciérralo y ábrelo otra vez. A veces Windows necesita una ventana nueva para reconocer los programas recién instalados.

## 2. Usar la página (lo más cómodo)

Doble clic en **`INICIAR.bat`**. Se abre **http://localhost:3000** en tu navegador.

- **Hacer clips:** pega la URL (YouTube, Kick, Twitch, TikTok, X...) o la ruta de un video de tu PC, por ejemplo `C:\Users\juanl\Videos\gta6.mp4`.
- **Qué buscar (opcional):** "solo momentos graciosos", "secretos del mapa", "lo que dice sobre el lanzamiento"...
- **Editar cada clip:** usa los botones rápidos o escribe lo que quieras:
  - `quita los silencios`
  - `pon NO PUEDE SER en el segundo 4`
  - `empieza 3 segundos antes y termina cuando dice "brutal"`
  - `corta la parte donde digo "espérate"`
  - `subtítulos en verde y en el centro`
  - `pantalla llena con zoom 1.3`
  - `cambia el texto de arriba a "SECRETO DE GTA 6"`
  - `hazlo un poco más rápido`
  - `deshacer`
- **Copiar texto:** copia el título, la descripción y los hashtags para pegarlos al subir el Short.

Para apagarla: cierra la ventana negra o presiona `Ctrl + C`.

## 3. Usar desde la terminal (opcional)

```powershell
npm run clip -- "https://www.youtube.com/watch?v=XXXX"
npm run clip -- "https://kick.com/video/XXXX" --pedido "solo momentos locos"
npm run editar -- 20261106-203000 1 "quita los silencios"
npm run editar -- 20261106-203000 1 deshacer
node src/cli.js lista
```

## 4. Dónde queda todo

| Carpeta | Qué tiene |
|---|---|
| `videos/` | Videos descargados |
| `clips/<proyecto>/` | Tus Shorts listos (`.mp4`) |
| `datos/<proyecto>/` | Transcripción y receta de cada clip |

Puedes borrar `videos/` cuando ya no necesites editar esos clips.

## 5. Ajustes (archivo `.env`)

| Opción | Para qué |
|---|---|
| `WHISPER_MODEL` | `base` = más rápido · `small` = mejor (por defecto) · `medium` = muy preciso pero lento |
| `MAX_CLIPS` | Cuántos clips por video |
| `DURACION_MIN` / `DURACION_MAX` | Duración de los clips en segundos |
| `MODO_VERTICAL` | `blur` (gameplay completo con fondo borroso) o `crop` (pantalla llena) |
| `SUBTITULOS` | `si` / `no` |
| `CLAUDE_MODEL` | Modelo de Claude |

## 6. Tiempos y costos

- **Whisper corre en tu laptop, gratis.** En tu Core Ultra 7 un video de 20 minutos tarda varios minutos con `small`. Un stream de 3 horas puede tardar bastante: déjalo trabajando o usa `base`.
- La transcripción se guarda: editar un clip después **no** vuelve a transcribir.
- **Claude** cuesta centavos por video (escoger clips) y menos de un centavo por cada edición.

## 7. Problemas comunes

| Error | Solución |
|---|---|
| `No se pudo ejecutar "yt-dlp"` / `"ffmpeg"` | Cierra y abre la terminal. Si sigue, vuelve a correr `INSTALAR.bat`. |
| `Falta tu API key` | Revisa el archivo `.env`. |
| `Falta faster-whisper` | `python -m pip install faster-whisper` |
| yt-dlp falla con una página | Actualízalo: `yt-dlp -U` o `winget upgrade yt-dlp.yt-dlp` |
| Stream en vivo | Espera a que termine y usa la URL del VOD (la grabación). |

## 8. Ojo con el contenido

Úsalo con **tus videos** y con contenido donde **tienes permiso** (campañas de Vyro/Whop, creadores que te autorizan). Descargar y resubir videos de otros sin permiso puede violar las reglas de las plataformas y los derechos de autor.

---

### Cómo está hecho (para tu portafolio)

| Archivo | Fase | Qué hace |
|---|---|---|
| `src/descargar.js` | 1 | Descarga con yt-dlp o usa un archivo local |
| `python/transcribir.py`, `src/transcribir.js` | 2 | Whisper con tiempos por palabra + picos de audio |
| `src/elegir.js`, `src/claude.js` | 3 | Claude escoge los momentos (JSON) |
| `src/render.js`, `src/subtitulos.js` | 4 | FFmpeg: cortes, 9:16, subtítulos ASS palabra por palabra |
| `src/editar.js` | 5 | Edición no destructiva con "recetas" + deshacer |
| `src/servidor.js`, `web/` | 6 | Página local con Express |
| `src/pipeline.js`, `src/cli.js` | — | Une todo / comandos de terminal |

Stack: Node.js · Express · Anthropic SDK · Python · faster-whisper · FFmpeg · yt-dlp
