# LemaClipper - instalador para Windows
# Ejecutalo con doble clic en INSTALAR.bat (no hace falta abrir este archivo).

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

function Refrescar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

function Instalar($nombre, $comando, $idWinget) {
    if (Get-Command $comando -ErrorAction SilentlyContinue) {
        Write-Host "  [OK] $nombre ya esta instalado" -ForegroundColor Green
    } else {
        Write-Host "  [..] Instalando $nombre..." -ForegroundColor Yellow
        winget install -e --id $idWinget --accept-source-agreements --accept-package-agreements --silent
        Refrescar-Path
    }
}

Write-Host ""
Write-Host "=== LemaClipper: instalando herramientas ===" -ForegroundColor Magenta
Write-Host ""

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "No encontre winget. Actualiza 'Instalador de aplicacion' desde la Microsoft Store y vuelve a intentar." -ForegroundColor Red
    exit 1
}

Instalar "Node.js" "node" "OpenJS.NodeJS.LTS"
Instalar "FFmpeg" "ffmpeg" "Gyan.FFmpeg"
Instalar "yt-dlp" "yt-dlp" "yt-dlp.yt-dlp"

# Python: el comando "python" puede ser un acceso directo falso de la Microsoft Store
$pythonOk = $false
try { $v = & python --version 2>&1; if ($v -match "Python 3") { $pythonOk = $true } } catch {}
if ($pythonOk) {
    Write-Host "  [OK] Python ya esta instalado ($v)" -ForegroundColor Green
} else {
    Write-Host "  [..] Instalando Python 3.12..." -ForegroundColor Yellow
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent
    Refrescar-Path
}

Write-Host ""
Write-Host "=== Instalando Whisper (transcripcion) ===" -ForegroundColor Magenta
python -m pip install --upgrade pip --quiet
python -m pip install --upgrade faster-whisper

Write-Host ""
Write-Host "=== Instalando dependencias del proyecto ===" -ForegroundColor Magenta
npm install

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "Cree el archivo .env. Abrelo y pega tu API key de Anthropic." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Verificando ===" -ForegroundColor Magenta
node src/cli.js prueba

Write-Host ""
Write-Host "Si todo sale con [OK] o con check verde, abre INICIAR.bat para usar la pagina." -ForegroundColor Cyan
Write-Host "Si algo fallo: cierra esta ventana y vuelve a abrir INSTALAR.bat (a veces Windows necesita reiniciar la ventana)." -ForegroundColor Cyan
Write-Host ""
