# api/webhooks/engine/verify-webhooks.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Manual verification script for /api/webhooks/engine/* — run against
# `vercel dev` (default: http://localhost:3000) or a real Vercel
# staging preview URL. Same real scenarios as
# PathScribe-Engine-Webhooks.postman_collection.json, as a single,
# runnable script for anyone who'd rather not open Postman.
#
# Usage:
#   .\verify-webhooks.ps1 -ApiKey "your-real-ENGINE_WEBHOOK_SECRET"
#   .\verify-webhooks.ps1 -ApiKey "..." -BaseUrl "https://your-staging-url.vercel.app"
#
# Exit code is non-zero if any check's actual status code didn't match
# its expected one — safe to use in a CI step once you have a real
# staging deployment to point this at.
# ─────────────────────────────────────────────────────────────────────────────

param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,

  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$script:FailureCount = 0
$script:TestCount = 0

function Test-Webhook {
  param(
    [string]$Name,
    [string]$Endpoint,
    [hashtable]$Body,
    [int]$ExpectedStatus,
    [switch]$NoAuth,
    [string]$ExpectedResponseStatus  # optional - checks the JSON body's own "status" field too
  )

  $script:TestCount++
  $uri = "$BaseUrl/api/webhooks/engine/$Endpoint"
  $headers = @{ "Content-Type" = "application/json" }
  if (-not $NoAuth) { $headers["x-api-key"] = $ApiKey }
  $jsonBody = $Body | ConvertTo-Json -Depth 10

  try {
    $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body $jsonBody -SkipHttpErrorCheck
    $actualStatus = $response.StatusCode
    $responseBody = $null
    try { $responseBody = $response.Content | ConvertFrom-Json } catch {}

    $statusOk = $actualStatus -eq $ExpectedStatus
    $bodyOk = $true
    if ($ExpectedResponseStatus -and $responseBody) {
      $bodyOk = $responseBody.status -eq $ExpectedResponseStatus
    }

    if ($statusOk -and $bodyOk) {
      Write-Host "[PASS] $Name (HTTP $actualStatus)" -ForegroundColor Green
    } else {
      $script:FailureCount++
      Write-Host "[FAIL] $Name — expected HTTP $ExpectedStatus$(if ($ExpectedResponseStatus) { " with body.status='$ExpectedResponseStatus'" }), got HTTP $actualStatus, body: $($response.Content)" -ForegroundColor Red
    }
  } catch {
    $script:FailureCount++
    Write-Host "[ERROR] $Name — request itself failed: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "`n=== Cassette Dispatch Outcome ===" -ForegroundColor Cyan

Test-Webhook -Name "Auth Guard Failure" -Endpoint "cassette-dispatch-outcome" -NoAuth -ExpectedStatus 401 -Body @{
  messageId = "ps-cdo-noauth-001"; caseId = "S26-4403"
  requestedColorKey = "COLOR_BIOPSY"; outcome = "fallback_used"
  reportedAt = "2026-08-27T12:00:00.000Z"
}

Test-Webhook -Name "Malformed Payload (bad outcome)" -Endpoint "cassette-dispatch-outcome" -ExpectedStatus 400 -Body @{
  messageId = "ps-cdo-badpayload-001"; caseId = "S26-4403"
  requestedColorKey = "COLOR_BIOPSY"; outcome = "INVALID_STATUS"
  reportedAt = "2026-08-27T12:00:00.000Z"
}

Test-Webhook -Name "Happy Path Dispatch" -Endpoint "cassette-dispatch-outcome" -ExpectedStatus 200 -ExpectedResponseStatus "accepted" -Body @{
  messageId = "ps-cdo-happy-001"; caseId = "S26-4403"; specimenLabel = "A"
  requestedColorKey = "COLOR_BIOPSY"; actualColorKey = "COLOR_WHITE"; outcome = "fallback_used"
  message = "Hopper empty (PowerShell manual test)"; reportedAt = "2026-08-27T12:00:00.000Z"
  sourceSystem = "PowerShell manual test"
}

Test-Webhook -Name "Redelivery (same messageId)" -Endpoint "cassette-dispatch-outcome" -ExpectedStatus 200 -ExpectedResponseStatus "already-processed" -Body @{
  messageId = "ps-cdo-happy-001"; caseId = "S26-4403"
  requestedColorKey = "COLOR_BIOPSY"; outcome = "fallback_used"
  reportedAt = "2026-08-27T12:00:00.000Z"
}

Write-Host "`n=== Block Exception ===" -ForegroundColor Cyan

Test-Webhook -Name "Auth Guard Failure" -Endpoint "block-exception" -NoAuth -ExpectedStatus 401 -Body @{
  messageId = "ps-be-noauth-001"; accessionNumber = "S26-4403"
  specimenLetter = "A"; blockNumber = "1"; status = "Lost"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Test-Webhook -Name "Malformed Payload (bad status)" -Endpoint "block-exception" -ExpectedStatus 400 -Body @{
  messageId = "ps-be-badpayload-001"; accessionNumber = "S26-4403"
  specimenLetter = "A"; blockNumber = "1"; status = "INVALID_STATUS"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Test-Webhook -Name "Case Not Found" -Endpoint "block-exception" -ExpectedStatus 404 -Body @{
  messageId = "ps-be-notfound-001"; accessionNumber = "DOES-NOT-EXIST-999"
  specimenLetter = "A"; blockNumber = "1"; status = "Lost"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Write-Host "`nNOTE: Block Exception / Material Location 'Happy Path' checks need a REAL accession/case in your own test data — run those manually with real values, not via this generic script.`n" -ForegroundColor Yellow

Write-Host "=== Material Location ===" -ForegroundColor Cyan

Test-Webhook -Name "Auth Guard Failure" -Endpoint "material-location" -NoAuth -ExpectedStatus 401 -Body @{
  messageId = "ps-ml-noauth-001"; accessionNumber = "S26-4403"; specimenLetter = "A"
  target = @{ level = "specimen" }; location = "Grossing"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Test-Webhook -Name "Malformed Payload (missing specimenLetter)" -Endpoint "material-location" -ExpectedStatus 400 -Body @{
  messageId = "ps-ml-badpayload-001"; accessionNumber = "S26-4403"
  target = @{ level = "specimen" }; location = "Grossing"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Test-Webhook -Name "Case Not Found" -Endpoint "material-location" -ExpectedStatus 404 -Body @{
  messageId = "ps-ml-notfound-001"; accessionNumber = "DOES-NOT-EXIST-999"; specimenLetter = "A"
  target = @{ level = "specimen" }; location = "Grossing"
  timestamp = "2026-08-27T12:00:00.000Z"; sourceSystem = "OTHER"
}

Write-Host "`n=== Engraver Status ===" -ForegroundColor Cyan

Test-Webhook -Name "Auth Guard Failure" -Endpoint "engraver-status" -NoAuth -ExpectedStatus 401 -Body @{
  messageId = "ps-es-noauth-001"; timestamp = "2026-08-27T12:00:00.000Z"
  organisationId = "ORG-TEST"; deviceId = "ENG-TEST-01"; status = "online"
  sourceSystem = "PowerShell manual test"
}

Test-Webhook -Name "Malformed Payload (bad supplyWarnings code)" -Endpoint "engraver-status" -ExpectedStatus 400 -Body @{
  messageId = "ps-es-badpayload-001"; timestamp = "2026-08-27T12:00:00.000Z"
  organisationId = "ORG-TEST"; deviceId = "ENG-TEST-01"; status = "warning"
  supplyWarnings = @(@{ code = "NOT_A_REAL_CODE" }); sourceSystem = "PowerShell manual test"
}

Test-Webhook -Name "Happy Path (supply low)" -Endpoint "engraver-status" -ExpectedStatus 200 -ExpectedResponseStatus "applied" -Body @{
  messageId = "ps-es-happy-001"; timestamp = "2026-08-27T12:00:00.000Z"
  organisationId = "ORG-TEST"; deviceId = "ENG-TEST-01"; deviceName = "Grossing Bench 01"
  status = "warning"; supplyWarnings = @(@{ code = "CASSETTE_SUPPLY_LOW"; colorKey = "COLOR_BIOPSY" })
  sourceSystem = "PowerShell manual test"
}

Test-Webhook -Name "Stale Telemetry (earlier timestamp)" -Endpoint "engraver-status" -ExpectedStatus 200 -ExpectedResponseStatus "stale-ignored" -Body @{
  messageId = "ps-es-stale-001"; timestamp = "2026-08-27T11:00:00.000Z"
  organisationId = "ORG-TEST"; deviceId = "ENG-TEST-01"; status = "online"
  sourceSystem = "PowerShell manual test"
}

Test-Webhook -Name "Redelivery (same messageId as Happy Path)" -Endpoint "engraver-status" -ExpectedStatus 200 -ExpectedResponseStatus "already-processed" -Body @{
  messageId = "ps-es-happy-001"; timestamp = "2026-08-27T12:00:00.000Z"
  organisationId = "ORG-TEST"; deviceId = "ENG-TEST-01"; status = "online"
  sourceSystem = "PowerShell manual test"
}

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host "Results: $($TestCount - $FailureCount)/$TestCount passed" -ForegroundColor $(if ($FailureCount -eq 0) { "Green" } else { "Red" })
Write-Host "=================================`n" -ForegroundColor Cyan

if ($FailureCount -gt 0) { exit 1 } else { exit 0 }
