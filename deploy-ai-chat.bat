@echo off
REM Deploy AI Chat Enhancement to Railway
REM This script commits and pushes the new AI chat features to Railway

echo 🚀 Deploying AI Chat Enhancement to Railway...
echo.

REM Check if git is initialized
if not exist ".git" (
    echo ❌ Error: Not a git repository
    exit /b 1
)

REM Check for uncommitted changes
git status --short > nul 2>&1
if %errorlevel% equ 0 (
    echo 📝 Uncommitted changes detected. Committing...
    
    REM Add all new files
    git add server/agents/MediatorAgent.js
    git add server/services/sharedAgentMemory.js
    git add server/services/chatService.js
    git add server/routes/chat.js
    git add server/agents/ProposalAgent.js
    git add components/ChatInterface.tsx
    git add components/LeadSearch.tsx
    git add services/apiService.ts
    git add AI_CHAT_ENHANCEMENT_SUMMARY.md
    git add FRONTEND_INTEGRATION_COMPLETE.md
    
    REM Commit changes
    git commit -m "feat: Add AI Chat Enhancement with Quotation System - Implement Shared Agent Memory for cross-agent context - Create Mediator Agent with Gemini AI integration - Add quotation generation and management system - Enhance Chat Interface with quotation display - Add quotation sending to Lead Search - Integrate all agents with shared memory - Add 5 pre-configured services with pricing - Implement bulk and referral discounts - Add quotation acceptance/rejection flow - Update API service with all endpoints"
    
    echo ✅ Changes committed
) else (
    echo ✅ No uncommitted changes
)

REM Push to Railway
echo.
echo 📤 Pushing to Railway...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ✅ Successfully pushed to Railway!
    echo.
    echo 🔄 Railway will automatically deploy the changes
    echo ⏱️  Deployment typically takes 2-3 minutes
    echo.
    echo 📊 Monitor deployment:
    echo    https://railway.app/dashboard
    echo.
    echo 🌐 Backend URL:
    echo    https://biggrow-production.up.railway.app
    echo.
    echo 🧪 Test endpoints:
    echo    curl https://biggrow-production.up.railway.app/api/chat/services/catalog
    echo    curl https://biggrow-production.up.railway.app/api/health
    echo.
    echo 📝 Next steps:
    echo    1. Wait for Railway deployment to complete
    echo    2. Test chat interface on frontend
    echo    3. Test quotation generation
    echo    4. Verify AI responses
    echo.
) else (
    echo.
    echo ❌ Failed to push to Railway
    echo Please check your git configuration and try again
    exit /b 1
)
