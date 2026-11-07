"""
FASE 2: transcribe el audio con faster-whisper (corre en tu CPU, gratis).

Uso: python transcribir.py <audio.wav> <salida.json> [modelo] [idioma]
Salida JSON: { "idioma": "es", "duracion": 123.4,
               "segmentos": [ { "inicio", "fin", "texto",
                                "palabras": [ {"inicio","fin","texto"} ] } ] }
"""
import json
import sys
import time


def main():
    if len(sys.argv) < 3:
        print("Uso: python transcribir.py <audio.wav> <salida.json> [modelo] [idioma]", file=sys.stderr)
        sys.exit(1)

    audio = sys.argv[1]
    salida = sys.argv[2]
    modelo = sys.argv[3] if len(sys.argv) > 3 else "small"
    idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Falta faster-whisper. Instala con: python -m pip install faster-whisper", file=sys.stderr)
        sys.exit(2)

    print(f"PROGRESO cargando modelo {modelo} (la primera vez se descarga)", flush=True)
    model = WhisperModel(modelo, device="cpu", compute_type="int8")

    inicio_t = time.time()
    segmentos, info = model.transcribe(
        audio,
        language=idioma,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=1,
    )

    duracion = info.duration or 1
    resultado = {"idioma": info.language, "duracion": info.duration, "segmentos": []}
    ultimo = -5

    for seg in segmentos:
        palabras = [
            {"inicio": round(p.start, 2), "fin": round(p.end, 2), "texto": p.word.strip()}
            for p in (seg.words or [])
            if p.word.strip()
        ]
        resultado["segmentos"].append(
            {"inicio": round(seg.start, 2), "fin": round(seg.end, 2), "texto": seg.text.strip(), "palabras": palabras}
        )
        porcentaje = int(seg.end / duracion * 100)
        if porcentaje >= ultimo + 5:
            ultimo = porcentaje
            print(f"PROGRESO {min(porcentaje, 100)}%", flush=True)

    with open(salida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)

    print(f"PROGRESO listo en {int(time.time() - inicio_t)}s", flush=True)


if __name__ == "__main__":
    main()
