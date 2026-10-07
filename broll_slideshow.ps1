# ============================================================
#  broll_slideshow.ps1
#  
#  1. Copies all images from broll\ to broll_backup\
#  2. Clears broll\ folder
#  3. Pastes images back ONE BY ONE every 3.5 seconds
#     (so you can screen-record the folder filling up)
# ============================================================

$sourceFolder = "C:\Users\js19187\Desktop\heygen workflow\processed\Avatar_Video-1--video-06baf7ae057d58e0\broll"
$backupFolder = "C:\Users\js19187\Desktop\heygen workflow\processed\Avatar_Video-1--video-06baf7ae057d58e0\broll_backup"
$delaySeconds = 3.5

# -- Step 1: Create backup folder
Write-Host ""
Write-Host "Creating backup folder..." -ForegroundColor Cyan
if (-Not (Test-Path $backupFolder)) {
    New-Item -ItemType Directory -Path $backupFolder | Out-Null
}

# -- Step 2: Copy all images to backup
$images = Get-ChildItem -Path $sourceFolder -File | Sort-Object Name
Write-Host "Copying $($images.Count) images to backup..." -ForegroundColor Cyan
Copy-Item -Path "$sourceFolder\*" -Destination $backupFolder -Force
Write-Host "Backup complete: $backupFolder" -ForegroundColor Green

# -- Step 3: Clear the broll folder
Write-Host ""
Write-Host "Clearing broll folder (originals are safely in backup)..." -ForegroundColor Yellow
Remove-Item -Path "$sourceFolder\*" -Force
Write-Host "broll folder is now empty." -ForegroundColor Green

# -- Step 4: Countdown before starting
Write-Host ""
Write-Host "Starting in 5 seconds - switch to your screen recorder NOW!" -ForegroundColor Magenta
Start-Sleep -Seconds 5

# -- Step 5: Paste images one by one
$backupImages = Get-ChildItem -Path $backupFolder -File | Sort-Object Name
$total = $backupImages.Count
$count = 0

Write-Host ""
Write-Host "Starting slideshow - $total images, $delaySeconds sec gap each" -ForegroundColor White

foreach ($img in $backupImages) {
    $count++
    Copy-Item -Path $img.FullName -Destination $sourceFolder -Force
    Write-Host "  [$count/$total] Added: $($img.Name)" -ForegroundColor Green

    # Don't sleep after the last image
    if ($count -lt $total) {
        Start-Sleep -Seconds $delaySeconds
    }
}

Write-Host ""
Write-Host "Done! All $total images are back in the broll folder." -ForegroundColor Cyan
Write-Host "You can now stop your screen recording." -ForegroundColor Cyan
Write-Host ""
