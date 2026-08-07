<#
.SYNOPSIS
claude-track collector installer for Windows (mirror of install.sh).

.DESCRIPTION
Downloads the latest standalone .exe from the project's GitHub Releases,
verifies its SHA-256 checksum, installs it as `claude-track` on your PATH, and
(when a token is available) registers it as an autostart Scheduled Task that
runs hidden at logon.

The repo is PRIVATE - downloads use the GitHub CLI (`gh`). Install it from
https://cli.github.com/ and run `gh auth login` once (or set GH_TOKEN).

.EXAMPLE
$s = irm https://raw.githubusercontent.com/rokartur/claude-track/main/install.ps1
& ([scriptblock]::Create($s)) -Token ctk_xxx

.EXAMPLE
.\install.ps1 -Token ctk_xxx -Endpoint https://track.example.com

.NOTES
Re-run the same command any time to update: it pulls the latest binary and
restarts the task.
#>
[CmdletBinding()]
param(
  # Device token from the server's Devices page; configures + enables autostart.
  [string]$Token = $env:CLAUDE_TRACK_TOKEN,
  # Server URL (default: https://claude-tracker.rokartur.com).
  [string]$Endpoint = $env:CLAUDE_TRACK_ENDPOINT,
  # Install location (default: %LOCALAPPDATA%\Programs\claude-track).
  [string]$BinDir = $env:CLAUDE_TRACK_BIN_DIR,
  # Pin a release tag instead of latest (e.g. v1.0.0.3).
  [string]$Version = $(if ($env:CLAUDE_TRACK_VERSION) { $env:CLAUDE_TRACK_VERSION } else { 'latest' }),
  # Install the binary only; don't register autostart.
  [switch]$NoService,
  # Register autostart even without a token (must be configured already).
  [switch]$Service
)

$ErrorActionPreference = 'Stop'
$repo = 'rokartur/claude-track'
$defaultEndpoint = 'https://claude-tracker.rokartur.com'
$asset = 'claude-track-windows-x64.exe'
$task = 'claude-track'

function Write-Info { param($m) Write-Host "==> $m" -ForegroundColor Blue }
function Write-Warn { param($m) Write-Host "warning: $m" -ForegroundColor Yellow }
function Die { param($m) Write-Host "error: $m" -ForegroundColor Red; exit 1 }

# While $ErrorActionPreference is 'Stop', PowerShell 5.1 turns anything a native
# command writes to stderr into a terminating NativeCommandError - and both
# `schtasks /end` on a missing task and `gh auth status` answer on stderr as a
# matter of course. Run native tools with the preference relaxed and judge them
# by their exit code, which is the only thing we actually care about.
function Invoke-Native {
  param([Parameter(Mandatory)][string]$File, [string[]]$ArgList = @(), [switch]$Quiet)
  # Assigning here shadows the script-scope preference for this call only.
  $ErrorActionPreference = 'Continue'
  if ($Quiet) { & $File @ArgList *>$null } else { & $File @ArgList 2>&1 | Out-Host }
  return $LASTEXITCODE
}

if ([Environment]::Is64BitOperatingSystem -eq $false) {
  Die 'unsupported architecture: only 64-bit Windows is published.'
}

# ---- release downloader (private repo -> gh) --------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Die "the GitHub CLI 'gh' is required (the repo is private). Install it: https://cli.github.com/ - then run 'gh auth login'."
}
if ((Invoke-Native gh @('auth', 'status') -Quiet) -ne 0 -and -not ($env:GH_TOKEN -or $env:GITHUB_TOKEN)) {
  Die "gh is not authenticated. Run 'gh auth login' (or set GH_TOKEN) and retry."
}

$tagArgs = @()
if ($Version -ne 'latest') { $tagArgs = @($Version) }

function Get-Asset {
  param([string]$Name, [string]$Dest)
  $a = @('release', 'download') + $tagArgs + @('-R', $repo, '-p', $Name, '-O', $Dest, '--clobber')
  return ((Invoke-Native gh $a -Quiet) -eq 0)
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-track-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $downloaded = Join-Path $tmp $asset
  Write-Info "Downloading $asset ($Version)..."
  if (-not (Get-Asset $asset $downloaded)) {
    Die "could not download $asset - check 'gh auth status', your repo access, and that a release with this asset exists."
  }

  # ---- verify checksum ------------------------------------------------------
  $sums = Join-Path $tmp 'SHA256SUMS.txt'
  if (Get-Asset 'SHA256SUMS.txt' $sums) {
    $want = (Get-Content $sums | ForEach-Object {
        $parts = $_ -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $asset) { $parts[0] }
      } | Select-Object -First 1)
    $got = (Get-FileHash -Algorithm SHA256 $downloaded).Hash.ToLower()
    if (-not $want) {
      Write-Warn "no checksum entry for $asset - skipping verification"
    }
    elseif ($want.ToLower() -ne $got) {
      Die "checksum mismatch for $asset (want $want, got $got) - refusing to install"
    }
    else { Write-Info 'Checksum OK.' }
  }
  else {
    Write-Warn 'could not fetch SHA256SUMS.txt - skipping checksum verification'
  }

  # ---- install --------------------------------------------------------------
  if (-not $BinDir) { $BinDir = Join-Path $env:LOCALAPPDATA 'Programs\claude-track' }
  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  $dest = Join-Path $BinDir 'claude-track.exe'

  # Stop the autostart task first: Windows locks a running .exe against
  # overwrite, so an update would otherwise fail here.
  $null = Invoke-Native schtasks @('/end', '/tn', $task) -Quiet
  try {
    Move-Item -LiteralPath $downloaded -Destination $dest -Force
  }
  catch {
    if (-not (Test-Path -LiteralPath $dest)) { throw }
    # Still locked (a `claude-track watch` running in some terminal): renaming a
    # running .exe aside IS allowed, so swap it out of the way and retry.
    Remove-Item -LiteralPath "$dest.old" -Force -ErrorAction SilentlyContinue
    Rename-Item -LiteralPath $dest -NewName ((Split-Path $dest -Leaf) + '.old') -Force
    Move-Item -LiteralPath $downloaded -Destination $dest -Force
  }
  # Mark-of-the-Web: a downloaded .exe is blocked by SmartScreen until unblocked.
  Unblock-File -LiteralPath $dest -ErrorAction SilentlyContinue

  Write-Info "Installed claude-track -> $dest"
  if ((Invoke-Native $dest @('help') -Quiet) -eq 0) { Write-Info 'Binary runs OK.' }
  else { Write-Warn 'binary installed but did not run cleanly.' }

  # ---- PATH -----------------------------------------------------------------
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if (($userPath -split ';') -notcontains $BinDir) {
    [Environment]::SetEnvironmentVariable('Path', (@($userPath.TrimEnd(';'), $BinDir) -join ';').TrimStart(';'), 'User')
    Write-Info "Added $BinDir to your user PATH (open a new terminal to pick it up)."
  }
  $env:Path = "$env:Path;$BinDir"

  # ---- configure ------------------------------------------------------------
  if ($Token) {
    if (-not $Endpoint) { $Endpoint = $defaultEndpoint }
    Write-Info "Configuring for $Endpoint (writing ~/.claude-track.json)..."
    if ((Invoke-Native $dest @('init', '--endpoint', $Endpoint, '--token', $Token)) -ne 0) {
      Die 'claude-track init failed - see the message above.'
    }
  }

  $configured = $false
  if ($Token -and $Endpoint) { $configured = $true }
  elseif ($env:CLAUDE_TRACK_TOKEN -and $env:CLAUDE_TRACK_ENDPOINT) { $configured = $true }
  else {
    $cfg = Join-Path $HOME '.claude-track.json'
    if (Test-Path $cfg) {
      $raw = Get-Content $cfg -Raw
      $configured = ($raw -match '"endpoint"') -and ($raw -match '"token"')
    }
  }

  # ---- autostart ------------------------------------------------------------
  if ($NoService) {
    Write-Host ''
    Write-Info 'Binary installed. Next steps:'
    if (-not $configured) { Write-Host "  claude-track init --endpoint $defaultEndpoint --token ctk_xxx" }
    Write-Host '  claude-track install        # enable autostart background task'
  }
  elseif ($Service -or $configured) {
    Write-Info 'Enabling autostart task...'
    if ((Invoke-Native $dest @('install')) -ne 0) {
      Die 'claude-track install failed - see the messages above.'
    }
    Write-Host ''
    Write-Info 'Done. claude-track is running and will start at logon.'
    Write-Info 'Update anytime by re-running this installer.'
  }
  else {
    Write-Host ''
    Write-Warn 'No token/endpoint configured - skipping autostart.'
    Write-Info 'Configure then enable it:'
    Write-Host "  claude-track init --endpoint $defaultEndpoint --token ctk_xxx"
    Write-Host '  claude-track install'
    Write-Host 'Or re-run this installer with: -Token ctk_xxx'
  }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
