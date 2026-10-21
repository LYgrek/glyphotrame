# Construit les installateurs signés pour les mises à jour automatiques, puis latest.json.
#   powershell -ExecutionPolicy Bypass -File .\tools\build-release.ps1
# La clé privée reste hors du projet (par défaut %USERPROFILE%\.tauri\glyphotrame.key) ;
# le mot de passe est demandé à chaque fois et n'est jamais écrit sur le disque.
# Voir docs/notes.md, section « Mises à jour ».
param(
  [string]$Cle = (Join-Path $env:USERPROFILE '.tauri\glyphotrame.key')
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path $Cle)) { throw "Clé privée introuvable : $Cle (voir docs/notes.md, « Mises à jour »)" }
$mdp = Read-Host 'Mot de passe de la clé de signature' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mdp)
try {
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $Cle -Raw).Trim()
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  npm run tauri build
  if ($LASTEXITCODE -ne 0) { throw "Le build a échoué (code $LASTEXITCODE)." }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
node tools/latest-json.mjs
if ($LASTEXITCODE -ne 0) { throw 'latest.json n''a pas pu être créé.' }
