@echo off
echo ========================================
echo Project Cleanup Script
echo ========================================
echo.
echo This will delete 39 unnecessary files from the project.
echo.
echo WARNING: This action cannot be undone!
echo Please ensure you have committed all changes before proceeding.
echo.
pause

echo.
echo Creating backup branch...
git checkout -b cleanup-backup-2026-01-24
git checkout main

echo.
echo Starting cleanup...
echo.

REM Documentation cleanup
echo [1/6] Removing duplicate documentation...
if exist AI_CHAT_ENHANCEMENT_SUMMARY.md del AI_CHAT_ENHANCEMENT_SUMMARY.md
if exist AI_CHAT_FIX_SUMMARY.md del AI_CHAT_FIX_SUMMARY.md
if exist FRONTEND_INTEGRATION_COMPLETE.md del FRONTEND_INTEGRATION_COMPLETE.md
if exist DEPLOY_AI_CHAT.md del DEPLOY_AI_CHAT.md
if exist DEPLOYMENT_STATUS.md del DEPLOYMENT_STATUS.md
if exist ENHANCED_FEATURES_SUMMARY.md del ENHANCED_FEATURES_SUMMARY.md
if exist ENHANCED_SEARCH_SETUP.md del ENHANCED_SEARCH_SETUP.md
if exist MAPS_QUICK_REFERENCE.md del MAPS_QUICK_REFERENCE.md
if exist QUICK_DEPLOY.md del QUICK_DEPLOY.md
if exist deploy-frontend.md del deploy-frontend.md
if exist setup.md del setup.md

REM Deployment scripts
echo [2/6] Removing unused deployment scripts...
if exist deploy.js del deploy.js
if exist deploy-frontend.js del deploy-frontend.js
if exist fix-deployment.js del fix-deployment.js
if exist push-fixes.bat del push-fixes.bat
if exist push-fixes.sh del push-fixes.sh
if exist deploy-ai-chat.bat del deploy-ai-chat.bat
if exist deploy-ai-chat.sh del deploy-ai-chat.sh
if exist netlify.toml del netlify.toml
if exist render.yaml del render.yaml
if exist docker-compose.yml del docker-compose.yml
if exist Dockerfile del Dockerfile

REM Test scripts
echo [3/6] Removing test/verification scripts...
if exist test-full-application.js del test-full-application.js
if exist test-live-app.js del test-live-app.js
if exist verify-deployment.js del verify-deployment.js
if exist verify-ai-chat-deployment.bat del verify-ai-chat-deployment.bat
if exist check-env.js del check-env.js
if exist metadata.json del metadata.json

REM Server test files
echo [4/6] Removing server manual test files...
if exist server\test-auth.js del server\test-auth.js
if exist server\test-cache-integration.js del server\test-cache-integration.js
if exist server\test-response-optimization.js del server\test-response-optimization.js

REM Components
echo [5/6] Removing unused components...
if exist components\Dashboard.tsx del components\Dashboard.tsx
if exist components\DeveloperDashboardSimple.tsx del components\DeveloperDashboardSimple.tsx
if exist components\FullScreenDashboard.tsx del components\FullScreenDashboard.tsx

REM Docs
if exist docs\MOCKUPS.md del docs\MOCKUPS.md
if exist docs\WIREFRAMES.md del docs\WIREFRAMES.md

REM Examples
echo [6/6] Removing examples directory...
if exist examples rmdir /s /q examples

REM Build artifacts
echo Removing build artifacts...
if exist dist rmdir /s /q dist

echo.
echo ========================================
echo Cleanup Complete!
echo ========================================
echo.
echo Files removed: 39
echo Directories removed: 2 (examples, dist)
echo.
echo Next steps:
echo 1. Review changes: git status
echo 2. Test application: npm run dev
echo 3. Test server: cd server ^&^& npm start
echo 4. If everything works, commit:
echo    git add -A
echo    git commit -m "chore: Remove unnecessary files and clean up project"
echo    git push origin main
echo.
echo If something breaks, restore from backup:
echo    git checkout cleanup-backup-2026-01-24
echo.
pause
