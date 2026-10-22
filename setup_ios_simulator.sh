#!/usr/bin/env bash
#
# setup_ios_simulator.sh
#
# macOS-only equivalent of setup_android_sdk.ps1.
# iOS Simulators ship with Xcode and run ONLY on macOS — there is no
# supported way to run them on Windows or Linux. Run this script on a Mac.
#
# It mirrors the Android script's flow:
#   1. Check prerequisites (macOS + Xcode)
#   2. Install the required Xcode command line tools / simulator runtime
#   3. Accept the Xcode license
#   4. Create a simulator device (the iOS equivalent of an AVD)
#   5. Boot the simulator

set -euo pipefail

# ---- Configuration -------------------------------------------------------
DEVICE_NAME="test_sim"
DEVICE_TYPE="iPhone 15"                 # must match `xcrun simctl list devicetypes`
RUNTIME_VERSION="17.5"                  # desired iOS runtime version
RUNTIME_ID="com.apple.CoreSimulator.SimRuntime.iOS-${RUNTIME_VERSION//./-}"

# ---- Argument parsing ----------------------------------------------------
LAUNCH_ONLY=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

Sets up and launches an iOS Simulator on macOS.

Options:
  --launch-only    Skip install/license/create steps and just boot an
                   existing device named "$DEVICE_NAME".
  -h, --help       Show this help and exit.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --launch-only) LAUNCH_ONLY=true; shift ;;
        -h|--help)     usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

# ---- 1. Prerequisite checks ---------------------------------------------
if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: iOS Simulators only run on macOS. This script cannot run on $(uname)." >&2
    exit 1
fi

# ---- Launch-only fast path ----------------------------------------------
# Boot an already-created device without re-running install/create steps.
if [[ "$LAUNCH_ONLY" == true ]]; then
    if ! command -v xcrun >/dev/null 2>&1; then
        echo "Error: xcrun not found. Install Xcode first." >&2
        exit 1
    fi
    DEVICE_ID=$(xcrun simctl list devices | grep "$DEVICE_NAME" | grep -oE '[0-9A-F-]{36}' | head -1 || true)
    if [[ -z "$DEVICE_ID" ]]; then
        echo "Error: no device named '$DEVICE_NAME' found. Run without --launch-only to create one." >&2
        echo "Available devices:" >&2
        xcrun simctl list devices >&2
        exit 1
    fi
    # Boot only if not already booted (booting a booted device errors out).
    if xcrun simctl list devices | grep "$DEVICE_ID" | grep -q "Booted"; then
        echo "Device '$DEVICE_NAME' is already booted."
    else
        xcrun simctl boot "$DEVICE_ID"
        echo "Device '$DEVICE_NAME' is booting."
    fi
    open -a Simulator
    exit 0
fi

if ! xcode-select -p >/dev/null 2>&1; then
    echo "Xcode command line tools not found. Installing..."
    xcode-select --install
    echo "Please complete the Xcode CLT installation, then re-run this script." >&2
    exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
    echo "Error: xcrun not found. Install the full Xcode from the App Store." >&2
    exit 1
fi

# ---- 2. Ensure a full Xcode (not just CLT) is selected -------------------
# simctl needs a full Xcode. Point xcode-select at it if present.
if [[ -d "/Applications/Xcode.app" ]]; then
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
else
    echo "Error: /Applications/Xcode.app not found. Install Xcode from the App Store first." >&2
    exit 1
fi

# ---- 3. Accept the Xcode license and install components ------------------
sudo xcodebuild -license accept
# Install any first-launch / additional required components (iOS platform support).
xcodebuild -runFirstLaunch || true

# Download the iOS runtime/platform if this Xcode version supports it (Xcode 15+).
if xcodebuild -downloadPlatform iOS 2>/dev/null; then
    echo "Requested iOS platform download."
else
    echo "Note: -downloadPlatform not supported by this Xcode; using bundled runtime."
fi

# ---- 4. Verify the runtime is available ----------------------------------
if ! xcrun simctl list runtimes | grep -q "iOS ${RUNTIME_VERSION}"; then
    echo "Warning: iOS ${RUNTIME_VERSION} runtime not found. Available runtimes:" >&2
    xcrun simctl list runtimes >&2
    # Fall back to the newest installed iOS runtime.
    RUNTIME_ID=$(xcrun simctl list runtimes | grep -oE 'com.apple.CoreSimulator.SimRuntime.iOS-[0-9-]+' | tail -1)
    if [[ -z "$RUNTIME_ID" ]]; then
        echo "Error: no iOS runtime available." >&2
        exit 1
    fi
    echo "Falling back to runtime: $RUNTIME_ID"
fi

# ---- 5. Create the simulator device (equivalent of an AVD) ---------------
# Delete an existing device with the same name to make this re-runnable (like --force).
EXISTING=$(xcrun simctl list devices | grep "$DEVICE_NAME" | grep -oE '[0-9A-F-]{36}' || true)
if [[ -n "$EXISTING" ]]; then
    echo "Removing existing device '$DEVICE_NAME'..."
    xcrun simctl delete "$EXISTING"
fi

echo "Creating simulator '$DEVICE_NAME' ($DEVICE_TYPE, $RUNTIME_ID)..."
DEVICE_ID=$(xcrun simctl create "$DEVICE_NAME" "$DEVICE_TYPE" "$RUNTIME_ID")
echo "Created device: $DEVICE_ID"

# ---- 6. Boot the simulator and open the Simulator UI ---------------------
xcrun simctl boot "$DEVICE_ID"
open -a Simulator
echo "Simulator '$DEVICE_NAME' is booting."
