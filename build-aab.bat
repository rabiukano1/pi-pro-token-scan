@echo off
REM Builds the Play Store AAB with ARM-only architectures (faster).
REM Emulator/debug builds still use all ABIs via normal commands.
cd /d "%~dp0android"
call gradlew bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a %*
