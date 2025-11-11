SETLOCAL

REM Get the target branch name from the first argument
SET NEW_BRANCH=%1

IF "%NEW_BRANCH%"=="" (
    ECHO ❌ ERROR: No branch name provided.
    GOTO :EOF
)

ECHO --- 🔄 Switching full environment to branch: %NEW_BRANCH% ---
ECHO.

REM --- Step 1: Stash current state ---
ECHO [Step 1/5] 🏷️  Stashing current image tags...
make stash-tags
ECHO.

REM --- Step 2: Backup current state ---
ECHO [Step 2/5] 📦 Backing up current volume data...
make backup
ECHO.

REM --- Step 3: Switch branch ---
ECHO [Step 3/5] 🌿 Switching to branch %NEW_BRANCH%...
git checkout %NEW_BRANCH%

IF %ERRORLEVEL% NEQ 0 (
    ECHO ❌ ERROR: 'git checkout %NEW_BRANCH%' failed. Aborting.
    GOTO :EOF
)
ECHO.

REM --- Step 4: Apply new branch tags ---
ECHO [Step 4/5] 🏷️  Applying new branch's image tags...
make apply-tags
ECHO.

REM --- Step 5: Apply new branch backup ---
ECHO [Step 5/5] 🚚 Applying new branch's volume data...
make apply-backup
ECHO.

ECHO ✅ Full environment switch to %NEW_BRANCH% is complete.
ENDLOCAL