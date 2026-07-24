# Traylist desktop installer (Windows) — latest GitHub Release.
# Usage: irm https://raw.githubusercontent.com/Haroon966/traylist/main/scripts/install.ps1 | iex
[CmdletBinding()]
param(
  [string]$Repo = $(if ($env:TRAYLIST_REPO) { $env:TRAYLIST_REPO } else { "Haroon966/traylist" }),
  [switch]$Prerelease
)

$ErrorActionPreference = "Stop"

function Get-ArchTag {
  switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
  }
}

function Score-Asset([string]$Name, [string]$Arch) {
  $n = $Name.ToLowerInvariant()
  if ($n.EndsWith(".sig") -or $n.EndsWith(".blockmap") -or $n.EndsWith(".json") -or $n.EndsWith(".zip")) {
    return -1
  }
  if (-not ($n.EndsWith(".msi") -or $n.EndsWith(".exe"))) { return -1 }

  $score = 0
  $archHints = @{
    amd64 = @("amd64", "x86_64", "x64", "x86-64")
    arm64 = @("arm64", "aarch64")
  }
  $hints = $archHints[$Arch]
  if ($hints | Where-Object { $n.Contains($_) }) { $score += 50 }
  elseif (-not (@($archHints["amd64"] + $archHints["arm64"]) | Where-Object { $n.Contains($_) })) { $score += 10 }
  else { return -1 }

  # Prefer MSI for silent-ish system install, then NSIS setup exe
  if ($n.EndsWith(".msi")) { $score += 30 }
  elseif ($n.Contains("setup") -and $n.EndsWith(".exe")) { $score += 25 }
  elseif ($n.EndsWith(".exe")) { $score += 15 }
  return $score
}

$arch = Get-ArchTag
$headers = @{ "User-Agent" = "traylist-install"; "Accept" = "application/vnd.github+json" }

Write-Host "==> Fetching latest Traylist release ($Repo)…"
if ($Prerelease -or $env:TRAYLIST_PRERELEASE -eq "1") {
  $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers
  $rel = $releases | Where-Object { -not $_.draft } | Select-Object -First 1
} else {
  try {
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers
  } catch {
    throw "No published release yet for $Repo. Tag vX.Y.Z and wait for the release workflow, or pass -Prerelease."
  }
}

if (-not $rel) { throw "No usable release found." }

$best = $null
$bestScore = -1
foreach ($a in $rel.assets) {
  $s = Score-Asset $a.name $arch
  if ($s -gt $bestScore) {
    $bestScore = $s
    $best = $a
  }
}
if (-not $best -or $bestScore -lt 0) {
  throw "No matching Windows/$arch asset in $($rel.tag_name). See https://github.com/$Repo/releases"
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) $best.name
Write-Host "==> Downloading $($best.name) ($($rel.tag_name))…"
Invoke-WebRequest -Uri $best.browser_download_url -OutFile $tmp -UseBasicParsing

$running = Get-Process -Name "traylist","Traylist" -ErrorAction SilentlyContinue
if ($running) {
  Write-Warning "Traylist is running — quit it from the tray before launching the new build."
}

Write-Host "==> Installing…"
if ($best.name -match '\.msi$') {
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$tmp`" /qn /norestart" -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
    # Fallback to UI if quiet install failed (policy / elevation)
    Start-Process msiexec.exe -ArgumentList "/i `"$tmp`"" -Wait | Out-Null
  }
} else {
  Start-Process -FilePath $tmp -Wait | Out-Null
}

Write-Host "==> Done. Launch Traylist from the Start menu."
