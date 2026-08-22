<#
.SYNOPSIS
    Replaces hardcoded PathScribe version strings with the __APP_VERSION__
    build-time define.

.DESCRIPTION
    Three call sites still hardcode v0.9.0. They need different syntax
    depending on context, which is why this uses an explicit rule table
    rather than a blind find/replace:

      - inside a template literal  ->  v${__APP_VERSION__}
      - inside JSX text            ->  v{__APP_VERSION__}

    A global replace would produce broken syntax in one context or the
    other, so each replacement is targeted and verified.

    Runs in preview mode by default. Nothing is written without -Apply.

.PARAMETER Apply
    Write the changes. Without this, the script only reports what it would do.

.PARAMETER NoBackup
    Skip writing .bak files alongside each modified file.

.EXAMPLE
    .\Update-VersionStrings.ps1
    Preview only.

.EXAMPLE
    .\Update-VersionStrings.ps1 -Apply
    Apply the changes, writing .bak backups first.

.NOTES
    Run from the project root: C:\Users\nimmo\Documents\pathscribe-ai
    Copyright (c) 2026 ForMedrixAI LLC. All rights reserved.
#>

[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'

# --- rule table -----------------------------------------------------------
# Each rule is matched literally. Short match strings are used deliberately:
# they avoid em dashes and other non-ASCII characters that can differ between
# what is on screen and what is in the file.
$rules = @(
    @{
        Path    = 'src\components\ValidationStudies\ValidationStudiesSection.tsx'
        Find    = '<td>v0.9.0</td>'
        Replace = '<td>v${__APP_VERSION__}</td>'
        Note    = 'Validation report — "PathScribe Version" row (template literal)'
    },
    @{
        Path    = 'src\components\NavBar\NavBar.tsx'
        Find    = 'PathScribe AI v0.9.0'
        Replace = 'PathScribe AI v${__APP_VERSION__}'
        Note    = 'Support report title (template literal)'
    },
    @{
        Path    = 'src\components\NavBar\NavBar.tsx'
        Find    = '<span className="fm-active-badge">v0.9.0</span>'
        Replace = '<span className="fm-active-badge">v{__APP_VERSION__}</span>'
        Note    = 'Nav version badge (JSX text — braces, no dollar sign)'
    }
)

# --- helpers --------------------------------------------------------------
# UTF-8 without BOM. PowerShell 5.1's Set-Content -Encoding UTF8 writes a BOM,
# which can upset toolchains and shows up as a spurious diff on every line.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Status {
    param([string]$Symbol, [string]$Message, [string]$Colour = 'Gray')
    Write-Host ("  {0} {1}" -f $Symbol, $Message) -ForegroundColor $Colour
}

# --- preflight ------------------------------------------------------------
if (-not (Test-Path 'package.json')) {
    throw "package.json not found. Run this from the project root."
}

$pkgVersion = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
Write-Host ""
Write-Host "PathScribe — version string migration" -ForegroundColor Cyan
Write-Host "package.json version: $pkgVersion"
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY' } else { 'PREVIEW (use -Apply to write)' })) `
    -ForegroundColor $(if ($Apply) { 'Yellow' } else { 'Green' })
Write-Host ""

# --- apply rules ----------------------------------------------------------
$applied = 0
$skipped = 0
$touchedFiles = @{}

foreach ($rule in $rules) {
    Write-Host $rule.Note -ForegroundColor White
    Write-Status '·' $rule.Path

    if (-not (Test-Path $rule.Path)) {
        Write-Status 'x' "File not found — skipped" 'Red'
        $skipped++
        continue
    }

    # -Raw preserves existing line endings; per-line reads would rewrite them.
    $content = [System.IO.File]::ReadAllText((Resolve-Path $rule.Path))

    # Literal count, not regex — the search strings contain regex metacharacters.
    $count = ([regex]::Matches($content, [regex]::Escape($rule.Find))).Count

    if ($count -eq 0) {
        if ($content.Contains($rule.Replace)) {
            Write-Status '=' "Already migrated — nothing to do" 'DarkGray'
        } else {
            Write-Status 'x' "Search string not found — left untouched" 'Red'
        }
        $skipped++
        continue
    }

    if ($count -gt 1) {
        Write-Status '!' "Found $count matches, expected 1 — left untouched for manual review" 'Red'
        $skipped++
        continue
    }

    Write-Status '-' ("was: " + $rule.Find) 'DarkGray'
    Write-Status '+' ("now: " + $rule.Replace) 'Green'

    if ($Apply) {
        $full = (Resolve-Path $rule.Path).Path

        if (-not $NoBackup -and -not $touchedFiles.ContainsKey($full)) {
            Copy-Item $full "$full.bak" -Force
            Write-Status '·' "backup: $(Split-Path $full -Leaf).bak" 'DarkGray'
        }
        $touchedFiles[$full] = $true

        $updated = $content.Replace($rule.Find, $rule.Replace)
        [System.IO.File]::WriteAllText($full, $updated, $utf8NoBom)
    }

    $applied++
    Write-Host ""
}

# --- report ---------------------------------------------------------------
Write-Host ("-" * 60)
Write-Host ("Replacements {0}: {1}   Skipped: {2}" -f `
    $(if ($Apply) { 'applied' } else { 'pending' }), $applied, $skipped)

# Remaining hardcoded versions anywhere in src/
$remaining = Get-ChildItem src -Recurse -Include *.ts,*.tsx |
    Select-String -Pattern 'v\d+\.\d+\.\d+' |
    Where-Object { $_.Line -notmatch '__APP_VERSION__' }

if ($remaining) {
    Write-Host ""
    Write-Host "Remaining hardcoded version strings in src\:" -ForegroundColor Yellow
    foreach ($hit in $remaining) {
        Write-Host ("  {0}:{1}" -f $hit.Path.Replace((Get-Location).Path + '\', ''), $hit.LineNumber)
        Write-Host ("      " + $hit.Line.Trim()) -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "  Review these by hand — comments and test fixtures are fine as they are." -ForegroundColor DarkGray
} else {
    Write-Host ""
    Write-Host "No remaining hardcoded version strings in src\." -ForegroundColor Green
}

if ($Apply) {
    Write-Host ""
    Write-Host "Done. Restart is not required — these are source files, so HMR will reload." -ForegroundColor Cyan
    if (-not $NoBackup) {
        Write-Host "Backups written as *.bak next to each modified file." -ForegroundColor DarkGray
    }
}
Write-Host ""
