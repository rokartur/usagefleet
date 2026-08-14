<#
.SYNOPSIS
usagefleet collector installer for Windows (mirror of install.sh).

.DESCRIPTION
Downloads the latest standalone .exe, verifies its SHA-256 checksum, installs
it as `usagefleet` on your PATH, and (when a token is available) registers it
as an autostart Scheduled Task that runs hidden at logon.

No GitHub account or `gh` needed: the server holds the one GitHub credential
and serves the binary itself. The source repo stays private.

.EXAMPLE
$s = irm https://usagefleet.com/install.ps1
& ([scriptblock]::Create($s)) -Token uf_xxx

.EXAMPLE
.\install.ps1 -Token uf_xxx -Endpoint https://track.example.com

.NOTES
Re-run the same command any time to update: it pulls the latest binary and
restarts the task.
#>
[CmdletBinding()]
param(
  # Device token from the server's Devices page; configures + enables autostart.
  [string]$Token = $env:USAGEFLEET_TOKEN,
  # Server URL, for self-hosted deployments. Serves the binary too.
  [string]$Endpoint = $(if ($env:USAGEFLEET_ENDPOINT) { $env:USAGEFLEET_ENDPOINT } else { 'https://usagefleet.com' }),
  # Install location (default: %LOCALAPPDATA%\Programs\usagefleet).
  [string]$BinDir = $env:USAGEFLEET_BIN_DIR,
  # Install the binary only; don't register autostart.
  [switch]$NoService,
  # Register autostart even without a token (must be configured already).
  [switch]$Service,
  # Install without verifying the SHA-256 (last resort; a tampered binary would run).
  [switch]$SkipChecksum
)

$ErrorActionPreference = 'Stop'
$asset = 'usagefleet-windows-x64.exe'
$task = 'usagefleet'

function Write-Info { param($m) Write-Host "==> $m" -ForegroundColor Blue }
function Write-Warn { param($m) Write-Host "warning: $m" -ForegroundColor Yellow }
function Die { param($m) Write-Host "error: $m" -ForegroundColor Red; exit 1 }

# While $ErrorActionPreference is 'Stop', PowerShell 5.1 turns anything a native
# command writes to stderr into a terminating NativeCommandError - and both
# `schtasks /end` on a missing task and the collector's own probes answer on
# stderr as a matter of course. Run native tools with the preference relaxed and
# judge them by their exit code, which is the only thing we actually care about.
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

# ---- release downloader -----------------------------------------------------
# The server proxies the private repo's release assets, so this needs no GitHub
# account, no `gh`, and no token - just the endpoint.
function Get-Asset {
  param([string]$Name, [string]$Dest)
  $uri = "$($Endpoint.TrimEnd('/'))/api/v1/collector/asset?asset=$([uri]::EscapeDataString($Name))"
  try {
    # -UseBasicParsing keeps this working on PowerShell 5.1 without IE engine.
    Invoke-WebRequest -Uri $uri -OutFile $Dest -UseBasicParsing
    return $true
  }
  catch { return $false }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("usagefleet-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $downloaded = Join-Path $tmp $asset
  Write-Info "Downloading $asset from $Endpoint..."
  if (-not (Get-Asset $asset $downloaded)) {
    Die "could not download $asset from $Endpoint - check the server is reachable and has a published release for your platform (retry in a few minutes if you were rate limited)."
  }

  # ---- verify checksum ------------------------------------------------------
  # Verification failure is fatal, never a warning: whatever can serve a tampered
  # binary can also make SHA256SUMS.txt unavailable, so degrading to a warning
  # hands the attacker the bypass for free. -SkipChecksum is the explicit way out.
  $sums = Join-Path $tmp 'SHA256SUMS.txt'
  if ($SkipChecksum) {
    Write-Warn "-SkipChecksum given - installing $asset WITHOUT verifying it"
  }
  elseif (Get-Asset 'SHA256SUMS.txt' $sums) {
    $want = (Get-Content $sums | ForEach-Object {
        $parts = $_ -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $asset) { $parts[0] }
      } | Select-Object -First 1)
    $got = (Get-FileHash -Algorithm SHA256 $downloaded).Hash.ToLower()
    if (-not $want) {
      Die "no checksum entry for $asset - refusing to install unverified (re-run with -SkipChecksum to override)"
    }
    elseif ($want.ToLower() -ne $got) {
      Die "checksum mismatch for $asset (want $want, got $got) - refusing to install"
    }
    else { Write-Info 'Checksum OK.' }
  }
  else {
    Die "could not fetch SHA256SUMS.txt from $Endpoint - refusing to install unverified (re-run with -SkipChecksum to override)"
  }

  # ---- install --------------------------------------------------------------
  if (-not $BinDir) { $BinDir = Join-Path $env:LOCALAPPDATA 'Programs\usagefleet' }
  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  $dest = Join-Path $BinDir 'usagefleet.exe'

  # Stop the autostart task first: Windows locks a running .exe against
  # overwrite, so an update would otherwise fail here.
  $null = Invoke-Native schtasks @('/end', '/tn', $task) -Quiet
  try {
    Move-Item -LiteralPath $downloaded -Destination $dest -Force
  }
  catch {
    if (-not (Test-Path -LiteralPath $dest)) { throw }
    # Still locked (a `usagefleet watch` running in some terminal): renaming a
    # running .exe aside IS allowed, so swap it out of the way and retry.
    Remove-Item -LiteralPath "$dest.old" -Force -ErrorAction SilentlyContinue
    Rename-Item -LiteralPath $dest -NewName ((Split-Path $dest -Leaf) + '.old') -Force
    Move-Item -LiteralPath $downloaded -Destination $dest -Force
  }
  # Mark-of-the-Web: a downloaded .exe is blocked by SmartScreen until unblocked.
  Unblock-File -LiteralPath $dest -ErrorAction SilentlyContinue

  Write-Info "Installed usagefleet -> $dest"
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
    Write-Info "Configuring for $Endpoint (writing ~/.config/usagefleet/config.json)..."
    if ((Invoke-Native $dest @('init', '--endpoint', $Endpoint, '--token', $Token)) -ne 0) {
      Die 'usagefleet init failed - see the message above.'
    }
  }

  $configured = $false
  if ($Token -and $Endpoint) { $configured = $true }
  elseif ($env:USAGEFLEET_TOKEN -and $env:USAGEFLEET_ENDPOINT) { $configured = $true }
  else {
    $base = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
    # Second path is a pre-consolidation install; the collector migrates it on
    # its next write, but until then that is where the token still lives.
    $cfg = @((Join-Path $base 'usagefleet\config.json'), (Join-Path $HOME '.usagefleet.json')) |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($cfg) {
      $raw = Get-Content $cfg -Raw
      $configured = ($raw -match '"endpoint"') -and ($raw -match '"token"')
    }
  }

  # ---- autostart ------------------------------------------------------------
  if ($NoService) {
    Write-Host ''
    Write-Info 'Binary installed. Next steps:'
    if (-not $configured) { Write-Host "  usagefleet init --endpoint $Endpoint --token uf_xxx" }
    Write-Host '  usagefleet install        # enable autostart background task'
  }
  elseif ($Service -or $configured) {
    Write-Info 'Enabling autostart task...'
    if ((Invoke-Native $dest @('install')) -ne 0) {
      Die 'usagefleet install failed - see the messages above.'
    }
    Write-Host ''
    Write-Info 'Done. usagefleet is running and will start at logon.'
    Write-Info 'Update anytime by re-running this installer.'
  }
  else {
    Write-Host ''
    Write-Warn 'No token/endpoint configured - skipping autostart.'
    Write-Info 'Configure then enable it:'
    Write-Host "  usagefleet init --endpoint $Endpoint --token uf_xxx"
    Write-Host '  usagefleet install'
    Write-Host 'Or re-run this installer with: -Token uf_xxx'
  }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
