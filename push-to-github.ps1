# Pulse -> GitHub
# Usage:  powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
# Optional: pass a repo name, e.g.  ... -File .\push-to-github.ps1 -RepoName pulse-analytics

param(
    [string]$RepoName = "pulse",
    [ValidateSet("public", "private")]
    [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Need($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { return $false }
    return $true
}

if (-not (Need git)) {
    Write-Host "git is not installed. Get it from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# --- init ---------------------------------------------------------------
if (-not (Test-Path ".git")) {
    Write-Host "Initializing repository..." -ForegroundColor Cyan
    git init -q
    git branch -M main
} else {
    Write-Host "Repository already initialized." -ForegroundColor DarkGray
}

# --- stage --------------------------------------------------------------
git add -A

# --- safety check: nothing sensitive staged -----------------------------
$staged = git diff --cached --name-only
$bad = $staged | Where-Object {
    $_ -match '(^|/)\.env$' -or
    $_ -match '(^|/)\.env\.local$' -or
    $_ -match '\.db($|-journal$|-wal$|-shm$)' -or
    $_ -match '(^|/)node_modules/'
}

if ($bad) {
    Write-Host "`nAborting - these should not be committed:" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "`nCheck .gitignore, then run: git rm -r --cached <path>" -ForegroundColor Yellow
    exit 1
}

Write-Host "$($staged.Count) files staged, no secrets detected." -ForegroundColor Green

# --- commit -------------------------------------------------------------
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "Pulse - real-time product analytics platform"
    Write-Host "Committed." -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit." -ForegroundColor DarkGray
}

# --- push ---------------------------------------------------------------
$hasRemote = git remote 2>$null | Where-Object { $_ -eq "origin" }

if ($hasRemote) {
    Write-Host "Pushing to existing remote..." -ForegroundColor Cyan
    git push -u origin main
}
elseif (Need gh) {
    Write-Host "Creating GitHub repo '$RepoName' ($Visibility) and pushing..." -ForegroundColor Cyan
    gh repo create $RepoName --$Visibility --source=. --remote=origin --push
}
else {
    Write-Host @"

Almost there - no 'origin' remote and the GitHub CLI isn't installed.

Option A - install the CLI (easiest), then re-run this script:
    winget install GitHub.cli
    gh auth login

Option B - do it manually:
    1. Create an EMPTY repo at https://github.com/new
       (no README, no .gitignore, no license)
    2. Then run:
         git remote add origin https://github.com/<your-username>/$RepoName.git
         git push -u origin main

"@ -ForegroundColor Yellow
    exit 0
}

Write-Host "`nDone." -ForegroundColor Green
git remote get-url origin 2>$null
