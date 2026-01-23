# BizGrow AI - Setup Guide

## 🚀 Quick Setup

### Prerequisites
- Node.js 18+ installed
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### 1. Clone and Install
```bash
git clone <repository-url>
cd bizgrow-ai-lead-generation-engine
npm run setup
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:
```env
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Start Development
```bash
# Start both frontend and backend
npm run dev:full
```

Or start them separately:
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run server
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Developer Dashboard**: http://localhost:3000/#/developer

## 🎯 Features Overview

### AI-Powered Automation
- **Business Discovery Agent**: Automatically finds local businesses using Google Maps + AI
- **Proposal Generation Agent**: Creates personalized IT service proposals
- **Project Builder Agent**: Builds complete websites automatically
- **Market Analytics Agent**: Analyzes regional performance and trends

### Developer Dashboard
- Real-time metrics and analytics
- AI agent status monitoring
- Regional performance tracking
- Live activity feed
- Automated workflow controls

### Lead Management
- Intelligent business discovery
- Digital presence analysis
- Lead status tracking
- Proposal generation and management

## 🔧 Manual Setup (Alternative)

If the quick setup doesn't work:

### Frontend Setup
```bash
npm install
```

### Backend Setup
```bash
cd server
npm install
npm run init-db
npm run dev
```

## 📊 Database

The system uses SQLite for simplicity. The database is automatically created at:
```
server/database/bizgrow.db
```

### Database Schema
- `businesses` - Discovered business data
- `proposals` - Generated proposals and responses
- `projects` - Built projects and deployment info
- `activity_log` - System activity tracking
- `agent_status` - AI agent monitoring
- `regional_analytics` - Performance metrics

## 🤖 AI Agents

### Business Discovery Agent
- Scans regions for businesses needing digital services
- Analyzes digital presence and opportunity scores
- Runs automated discovery every hour

### Proposal Generation Agent
- Creates personalized IT service proposals
- Sends proposals via email (if configured)
- Tracks responses and interest levels
- Runs automated proposals every 30 minutes

### Project Builder Agent
- Builds complete websites for interested businesses
- Generates HTML, CSS, JavaScript files
- Simulates deployment process
- Runs automated building every 2 hours

## 📧 Email Configuration (Optional)

For automated proposal sending, configure email in `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=noreply@bizgrow-ai.com
```

## 🔍 Troubleshooting

### Common Issues

**Database not found**
```bash
cd server && npm run init-db
```

**API key errors**
- Ensure GEMINI_API_KEY is set in `.env`
- Verify the API key is valid

**Port conflicts**
- Frontend: Change port in `vite.config.ts`
- Backend: Change PORT in `.env`

**Permission errors**
```bash
chmod +x setup.sh  # If using setup script
```

## 📈 Usage Tips

1. **Start with Developer Dashboard** - Monitor AI agents and system performance
2. **Use Bulk Scan** - Trigger mass business discovery across multiple regions  
3. **Monitor Activity Feed** - Track real-time AI operations
4. **Check Regional Analytics** - Identify high-opportunity markets
5. **Review Generated Projects** - See automatically built websites in `server/generated-projects/`

## 🎯 Next Steps

After setup:
1. Visit the Developer Dashboard to see AI agents in action
2. Use the Lead Finder to discover businesses manually
3. Check the generated proposals and projects
4. Monitor regional performance and conversion rates
5. Scale up by adding more regions and business types

## 🆘 Support

If you encounter issues:
1. Check the console logs for errors
2. Verify all environment variables are set
3. Ensure Node.js version is 18+
4. Check that ports 3000 and 3001 are available