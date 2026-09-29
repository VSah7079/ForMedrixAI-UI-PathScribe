# Compare-PathScribeManifest.ps1
# Lists files in your local PathScribe repo that are NOT in the reference
# copy's manifest (pathscribe-file-manifest.txt). Report only: it deletes
# nothing. Delta zips can add and update files but can't delete them, so
# files removed in earlier batches may still be on disk locally.
#
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File .\Compare-PathScribeManifest.ps1
param([string]$Manifest = ".\pathscribe-file-manifest.txt")

$expected = Get-Content $Manifest | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$set = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($f in $expected) { [void]$set.Add($f) }

$root = (Get-Location).Path
$local = Get-ChildItem -Path src, api, scripts -Recurse -File |
  ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') }

$extra = $local | Where-Object { -not $set.Contains($_) } | Sort-Object
if ($extra.Count -eq 0) {
  Write-Host "No extra files. Your src/, api/ and scripts/ match the reference copy."
} else {
  Write-Host "$($extra.Count) file(s) exist locally but not in the reference copy:"
  $extra | ForEach-Object { Write-Host "  $_" }
  $extra | Set-Content .\pathscribe-extra-files.txt
  Write-Host "Saved to pathscribe-extra-files.txt"
}
