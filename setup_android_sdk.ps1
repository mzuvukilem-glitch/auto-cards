# Define variables
$sdkRoot = "C:\Android\sdk"
$cmdlineToolsZip = "commandlinetools-win-11076708_latest.zip"
$cmdlineToolsUrl = "https://dl.google.com/android/repository/$cmdlineToolsZip"
 
# Check if JAVA_HOME is set
if (-not $env:JAVA_HOME) {
    Write-Error "JAVA_HOME is not set. Please set JAVA_HOME before running this script."
    exit 1
}
 
# Create SDK directory
New-Item -ItemType Directory -Force -Path $sdkRoot | Out-Null
 
# Download command-line tools
Invoke-WebRequest -Uri $cmdlineToolsUrl -OutFile "$sdkRoot\$cmdlineToolsZip"
 
# Extract command-line tools
Expand-Archive -Path "$sdkRoot\$cmdlineToolsZip" -DestinationPath "$sdkRoot\cmdline-tools_temp" -Force
New-Item -ItemType Directory -Force -Path "$sdkRoot\cmdline-tools\latest" | Out-Null
 
# Check the actual directory structure and move files accordingly
if (Test-Path "$sdkRoot\cmdline-tools_temp\cmdline-tools") {
    Move-Item -Path "$sdkRoot\cmdline-tools_temp\cmdline-tools\*" -Destination "$sdkRoot\cmdline-tools\latest"
} elseif (Test-Path "$sdkRoot\cmdline-tools_temp\*") {
    Move-Item -Path "$sdkRoot\cmdline-tools_temp\*" -Destination "$sdkRoot\cmdline-tools\latest"
} else {
    Write-Error "Unexpected directory structure in extracted command-line tools."
    exit 1
}
 
Remove-Item -Path "$sdkRoot\cmdline-tools_temp" -Recurse -Force
 
# Set environment variables
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkRoot, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkRoot, "User")
$path = [Environment]::GetEnvironmentVariable("Path", "User")
$newPath = "$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$sdkRoot\tools;$sdkRoot\tools\bin;$sdkRoot\emulator;$path"
[Environment]::SetEnvironmentVariable("Path", $newPath, "User")
 
# Refresh environment variables in current session
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$sdkRoot\emulator;" + $env:Path
 
# Error checking
if (-not (Test-Path "$sdkRoot\cmdline-tools\latest\bin\sdkmanager.bat")) {
    Write-Error "sdkmanager.bat not found. Installation may have failed."
    exit 1
}
 
# Install necessary SDK components
& "$sdkRoot\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-35" "system-images;android-35;google_apis;x86_64" "build-tools;30.0.3" "emulator"
Start-Sleep -Seconds 30  # Wait for installations to complete
 
# Accept licenses
Echo "y" | & "$sdkRoot\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
 
# Create AVD
& "$sdkRoot\cmdline-tools\latest\bin\avdmanager.bat" create avd -n "test_avd" -k "system-images;android-35;google_apis;x86_64" --force
 
# Launch emulator
Start-Process -FilePath "$sdkRoot\emulator\emulator.exe" -ArgumentList "-avd test_avd"