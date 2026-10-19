# Vérifie que tous les outils nécessaires à Glyphotrame sont installés.
# Lancer depuis le dossier du projet :
#   powershell -ExecutionPolicy Bypass -File .\verifier-installation.ps1

$manque = 0

function Test-Outil($nom, $commande, $lien) {
  $cmd = Get-Command $commande -ErrorAction SilentlyContinue
  if ($cmd) {
    $version = (& $commande --version 2>$null | Select-Object -First 1)
    Write-Host ("[OK]       {0,-22} {1}" -f $nom, $version) -ForegroundColor Green
  } else {
    Write-Host ("[MANQUANT] {0,-22} -> {1}" -f $nom, $lien) -ForegroundColor Red
    $script:manque++
  }
}

Write-Host ""
Write-Host "Glyphotrame - verification de l'installation" -ForegroundColor Cyan
Write-Host "--------------------------------------------"

Test-Outil "Node.js"  "node"  "https://nodejs.org (version LTS)"
Test-Outil "npm"      "npm"   "installe avec Node.js"
Test-Outil "Git"      "git"   "https://git-scm.com/downloads/win"
Test-Outil "Rust"     "rustc" "https://rustup.rs (rustup-init.exe)"
Test-Outil "Cargo"    "cargo" "installe avec Rust"
Test-Outil "VS Code"  "code"  "https://code.visualstudio.com"

# Rust doit utiliser la chaine MSVC sous Windows
if (Get-Command rustup -ErrorAction SilentlyContinue) {
  $chaine = (rustup default 2>$null)
  if ($chaine -match "msvc") {
    Write-Host ("[OK]       {0,-22} {1}" -f "Chaine Rust MSVC", $chaine) -ForegroundColor Green
  } else {
    Write-Host ("[A REGLER] {0,-22} -> lancer : rustup default stable-msvc" -f "Chaine Rust MSVC") -ForegroundColor Yellow
    $manque++
  }
}

# Microsoft C++ Build Tools (option "Developpement Desktop en C++")
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vc = $null
if (Test-Path $vswhere) {
  $vc = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
}
if ($vc) {
  Write-Host ("[OK]       {0,-22} {1}" -f "C++ Build Tools", $vc) -ForegroundColor Green
} else {
  Write-Host ("[MANQUANT] {0,-22} -> https://visualstudio.microsoft.com/visual-cpp-build-tools/ (cocher 'Developpement Desktop en C++')" -f "C++ Build Tools") -ForegroundColor Red
  $manque++
}

# WebView2 (normalement deja present sur Windows 10 et 11)
$cle = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$wv = $null
foreach ($base in @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients", "HKCU:\Software\Microsoft\EdgeUpdate\Clients")) {
  $p = Get-ItemProperty -Path (Join-Path $base $cle) -ErrorAction SilentlyContinue
  if ($p -and $p.pv) { $wv = $p.pv; break }
}
if ($wv) {
  Write-Host ("[OK]       {0,-22} {1}" -f "WebView2", $wv) -ForegroundColor Green
} else {
  Write-Host ("[MANQUANT] {0,-22} -> https://developer.microsoft.com/microsoft-edge/webview2/" -f "WebView2") -ForegroundColor Red
  $manque++
}

# Claude Code (extension VS Code ou ligne de commande) : facultatif pour ce script
if (Get-Command code -ErrorAction SilentlyContinue) {
  $ext = (code --list-extensions 2>$null) -join " "
  if ($ext -match "anthropic.claude-code") {
    Write-Host ("[OK]       {0,-22} {1}" -f "Claude Code (VS Code)", "extension installee") -ForegroundColor Green
  } else {
    Write-Host ("[CONSEIL]  {0,-22} -> dans VS Code : Extensions > rechercher 'Claude Code'" -f "Claude Code (VS Code)") -ForegroundColor Yellow
  }
}

Write-Host "--------------------------------------------"
if ($manque -eq 0) {
  Write-Host "Tout est pret. Etape suivante : npm install, puis npm run tauri dev" -ForegroundColor Cyan
} else {
  Write-Host "$manque element(s) a installer ou regler. Installe-les, redemarre le PC, puis relance ce script." -ForegroundColor Yellow
}
Write-Host ""
