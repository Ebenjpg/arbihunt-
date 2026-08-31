# restart-backend.ps1
# Run this yourself whenever the backend needs restarting — don't ask the agent to do it.

$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server.ts' }
if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }

Start-Sleep -Seconds 1

Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList '--require','C:\Users\Eben\Downloads\arbihunt\node_modules\tsx\dist\preflight.cjs','--import','file:///C:/Users/Eben/Downloads/arbihunt/node_modules/tsx/dist/loader.mjs','src/server.ts' `
  -WorkingDirectory "C:\Users\Eben\Downloads\arbihunt\backend" `
  -RedirectStandardOutput "C:\Users\Eben\Downloads\arbihunt\backend.log" `
  -RedirectStandardError "C:\Users\Eben\Downloads\arbihunt\backend.err.log" `
  -WindowStyle Hidden

Write-Output "Backend restarted. Check backend.log / backend.err.log if something looks off."
