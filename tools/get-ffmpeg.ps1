# Télécharge ffmpeg.exe et ffprobe.exe (Windows 64 bits) et les place dans src-tauri\binaries\
# sous les noms attendus par Tauri pour un « sidecar » : ffmpeg-<cible>.exe, ffprobe-<cible>.exe
# (cible = x86_64-pc-windows-msvc).
#
# Source : builds stables de BtbN (https://github.com/BtbN/FFmpeg-Builds), somme SHA-256 vérifiée.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File .\tools\get-ffmpeg.ps1              # build GPL (avec x264)
#   powershell -ExecutionPolicy Bypass -File .\tools\get-ffmpeg.ps1 -Licence lgpl # build LGPL (sans x264)
#   ... -Force   : retélécharge même si les binaires sont déjà là
#
# Licence : pour un usage personnel, les deux conviennent. Avant de diffuser l'application,
# vérifier la licence de la build (GPL si elle contient x264) ; voir docs/video.md.

param(
  [ValidateSet('gpl', 'lgpl')] [string] $Licence = 'gpl',
  [switch] $Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$racine = Split-Path -Parent $PSScriptRoot
$dossier = Join-Path $racine 'src-tauri\binaries'
$cible = 'x86_64-pc-windows-msvc'
$ffmpeg = Join-Path $dossier "ffmpeg-$cible.exe"
$ffprobe = Join-Path $dossier "ffprobe-$cible.exe"

if ((Test-Path $ffmpeg) -and (Test-Path $ffprobe) -and -not $Force) {
  Write-Host "[OK] ffmpeg et ffprobe sont déjà dans src-tauri\binaries (option -Force pour les remplacer)." -ForegroundColor Green
  & $ffmpeg -hide_banner -version | Select-Object -First 1
  exit 0
}

# Dernière build stable (ffmpeg-n<version>-latest-win64-<licence>-<version>.zip), pas la branche de développement
Write-Host "Recherche de la dernière build $Licence..."
$publication = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest' -Headers @{ 'User-Agent' = 'glyphotrame' }
$motif = "^ffmpeg-n(\d+)\.(\d+)-latest-win64-$Licence-\d+\.\d+\.zip$"
$archive = $publication.assets |
  Where-Object { $_.name -match $motif } |
  Sort-Object { [int]([regex]::Match($_.name, $motif).Groups[1].Value) }, { [int]([regex]::Match($_.name, $motif).Groups[2].Value) } |
  Select-Object -Last 1
$sommes = $publication.assets | Where-Object { $_.name -eq 'checksums.sha256' } | Select-Object -First 1
if (-not $archive) { throw "Aucune build '$Licence' trouvée dans la dernière publication de BtbN." }
if (-not $sommes) { throw "Fichier de sommes de contrôle introuvable : téléchargement refusé." }

$temp = Join-Path ([IO.Path]::GetTempPath()) ('glyphotrame-ffmpeg-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $temp | Out-Null
try {
  $zip = Join-Path $temp $archive.name
  Write-Host "Téléchargement de $($archive.name) ($([math]::Round($archive.size / 1MB)) Mo)..."
  Invoke-WebRequest -UseBasicParsing -Uri $archive.browser_download_url -OutFile $zip

  # vérification SHA-256
  $liste = (Invoke-WebRequest -UseBasicParsing -Uri $sommes.browser_download_url).Content
  if ($liste -is [byte[]]) { $liste = [Text.Encoding]::UTF8.GetString($liste) }
  $ligne = ($liste -split "`n") | Where-Object { $_ -match [regex]::Escape($archive.name) } | Select-Object -First 1
  if (-not $ligne) { throw "Somme de contrôle absente pour $($archive.name)." }
  $attendue = ($ligne -split '\s+')[0].ToLower()
  $obtenue = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
  if ($attendue -ne $obtenue) { throw "Somme SHA-256 incorrecte : fichier corrompu ou modifié ($obtenue au lieu de $attendue)." }
  Write-Host "[OK] Somme SHA-256 vérifiée." -ForegroundColor Green

  Expand-Archive -Path $zip -DestinationPath $temp -Force
  $bin = Get-ChildItem -Path $temp -Recurse -Directory -Filter 'bin' | Select-Object -First 1
  if (-not $bin -or -not (Test-Path (Join-Path $bin.FullName 'ffmpeg.exe'))) { throw "ffmpeg.exe introuvable dans l'archive." }

  New-Item -ItemType Directory -Force $dossier | Out-Null
  Copy-Item (Join-Path $bin.FullName 'ffmpeg.exe') $ffmpeg -Force
  Copy-Item (Join-Path $bin.FullName 'ffprobe.exe') $ffprobe -Force
  # trace de la build installée (licence, version)
  Set-Content -Encoding utf8 -Path (Join-Path $dossier 'ffmpeg-build.txt') -Value @(
    "Archive : $($archive.name)",
    "Licence : $Licence",
    "Source  : $($archive.browser_download_url)",
    "SHA-256 : $obtenue",
    "Installé le $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  )
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

Write-Host "[OK] Binaires installés dans src-tauri\binaries :" -ForegroundColor Green
Write-Host "     $(Split-Path -Leaf $ffmpeg)"
Write-Host "     $(Split-Path -Leaf $ffprobe)"
& $ffmpeg -hide_banner -version | Select-Object -First 1
