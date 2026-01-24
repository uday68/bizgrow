#!/bin/bash

# Deploy AI Chat Enhancement to Railway
# This script commits and pushes the new AI chat features to Railway

echo "🚀 Deploying AI Chat Enhancement to Railway..."
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "📝 Uncommitted changes detected. Committing..."
    
    # Add all new files
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
    
    # Commit changes
    git commit -m "feat: Add AI Chat Enhancement with Quotation System

- Implement Shared Agent Memory for cross-agent context
- Create Mediator Agent with Gemini AI integration
- Add quotation generation and management system
- Enhance Chat Interface with quotation display
- Add quotation sending to Lead Search
- Integrate all agents with shared memory
- Add 5 pre-configured services with pricing
- Implement bulk and referral discounts
- Add quotation acceptance/rejection flow
- Update API service with all endpoints

Features:
- AI-powered customer chat with context awareness
- Instant quotation generation
- Service recommendations
- Real-time pricing with discounts
- Quotation lifecycle management
- Shared memory across all AI agents

Backend:
- MediatorAgent.js - AI mediator with Gemini
- sharedAgentMemory.js - Centralized memory system
- Enhanced chatService.js with AI integration
- New quotation endpoints in chat routes
- Updated ProposalAgent with shared memory

Frontend:
- Enhanced ChatInterface with quotations
- LeadSearch with quotation sending
- Full quotation modal with accept/reject
- Service selection interface
- Real-time price calculation

Ready for production deployment."
    
    echo "✅ Changes committed"
else
    echo "✅ No uncommitted changes"
fi

# Push to Railway
echo ""
echo "📤 Pushing to Railway..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to Railway!"
    echo ""
    echo "🔄 Railway will automatically deploy the changes"
    echo "⏱️  Deployment typically takes 2-3 minutes"
    echo ""
    echo "📊 Monitor deployment:"
    echo "   https://railway.app/dashboard"
    echo ""
    echo "🌐 Backend URL:"
    echo "   https://biggrow-production.up.railway.app"
    echo ""
    echo "🧪 Test endpoints:"
    echo "   curl https://biggrow-production.up.railway.app/api/chat/services/catalog"
    echo "   curl https://biggrow-production.up.railway.app/api/health"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Wait for Railway deployment to complete"
    echo "   2. Test chat interface on frontend"
    echo "   3. Test quotation generation"
    echo "   4. Verify AI responses"
    echo ""
else
    echo ""
    echo "❌ Failed to push to Railway"
    echo "Please check your git configuration and try again"
    exit 1
fi
