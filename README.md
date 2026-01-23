# BizGrow AI - Lead Generation Engine

## 📌 Overview
**BizGrow AI** is an intelligent lead generation platform that leverages Google's Gemini AI to automatically discover local businesses, analyze their digital presence, and generate personalized IT service proposals. The system identifies businesses with growth potential and creates tailored digital transformation strategies.

This React-based web application demonstrates **AI-driven business intelligence**, **automated lead discovery**, and **intelligent proposal generation** for IT service providers.

---

## 🎯 Problem Statement
Many local businesses struggle with:
- No or outdated websites
- Poor online visibility and digital presence
- Lack of online ordering or inventory systems
- Missing customer engagement tools
- Limited technical knowledge for digital transformation

These businesses lose potential customers daily but lack awareness of digital solutions that could drive growth.

---

## 💡 Solution Features
The platform automatically:
1. **Discovers businesses** using AI-powered Google Maps integration
2. **Analyzes digital maturity** and identifies gaps in online presence
3. **Evaluates growth potential** based on location, ratings, and market factors
4. **Generates personalized proposals** for IT services and digital solutions
5. **Manages lead pipeline** with status tracking and conversion metrics
6. **Creates professional presentations** with print/PDF capabilities

---

## 🚀 Current Implementation

### ✅ Completed Features
- **AI-Powered Lead Discovery**: Search and identify businesses using Gemini AI + Google Maps
- **Digital Presence Analysis**: Automatically detect businesses without websites
- **Intelligent Proposal Generation**: Create customized IT service pitches using AI
- **Lead Management Dashboard**: Track leads, status updates, and conversion pipeline
- **Professional UI/UX**: Modern, responsive design with Tailwind CSS
- **Geolocation Support**: Location-aware business search for better targeting
- **Local Data Persistence**: Browser-based storage for lead management

### 🔧 Technical Architecture
- **Frontend**: React 19.2.3 + TypeScript + Vite
- **AI Integration**: Google Gemini AI (2.5-flash, 3-flash-preview models)
- **Styling**: Tailwind CSS with custom design system
- **Routing**: React Router for SPA navigation
- **Icons**: Lucide React icon library
- **Maps**: Google Maps API integration

---

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+ 
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Quick Start (Recommended)

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd bizgrow-ai-lead-generation-engine
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

3. **Start the application**
   ```bash
   npm start
   ```
   
   This will automatically:
   - Install server dependencies
   - Initialize the database
   - Start both frontend and backend
   - Display access URLs and status

### Manual Setup (Alternative)

If you prefer manual control:

```bash
# Install dependencies
npm install
npm run server:install

# Initialize database
npm run server:init

# Start services separately
npm run dev          # Frontend (Terminal 1)
npm run server       # Backend (Terminal 2)
```

### Access Points
- **Frontend Dashboard**: http://localhost:3000
- **Developer Control Center**: http://localhost:3000/#/developer
- **Backend API**: http://localhost:3001
- **WebSocket**: ws://localhost:3001

---

## 📊 Developer Control Center

### Real-Time Monitoring Dashboard
The Developer Dashboard provides complete oversight of the AI automation system:

#### Key Metrics
- **Businesses Discovered**: Total count with growth trends
- **Proposals Sent**: Automated outreach statistics  
- **Interest Responses**: Conversion tracking
- **Projects Built**: Completed website deployments

#### AI Agent Management
- **Live Status Monitoring**: See what each agent is currently doing
- **Performance Metrics**: Track completion rates and efficiency
- **Manual Controls**: Start/stop agents or trigger specific tasks
- **Queue Management**: Monitor pending work and processing status

#### Regional Analytics
- **Geographic Performance**: Revenue and conversion by region
- **Market Opportunities**: Identify high-potential areas
- **Competitive Analysis**: Track market saturation and gaps

#### Live Activity Feed
- **Real-Time Updates**: See AI operations as they happen
- **WebSocket Integration**: Instant notifications and status changes
- **Historical Tracking**: Review past activities and outcomes

---

## 🤖 AI Agent Architecture

### Automated Business Pipeline
The system runs **4 specialized AI agents** that work together to automate the entire business development process:

#### 1. Business Discovery Agent
- **Purpose**: Finds local businesses with growth potential
- **Frequency**: Runs every hour + on-demand
- **Capabilities**:
  - Google Maps integration for real business data
  - Digital presence analysis (website detection)
  - Opportunity scoring (0-100 scale)
  - Industry categorization and targeting

#### 2. Proposal Generation Agent  
- **Purpose**: Creates personalized IT service proposals
- **Frequency**: Runs every 30 minutes + triggered by discoveries
- **Capabilities**:
  - AI-powered market analysis and gap assessment
  - Customized service recommendations
  - Professional proposal formatting
  - Email delivery (when configured)

#### 3. Project Builder Agent
- **Purpose**: Automatically builds websites for interested businesses
- **Frequency**: Runs every 2 hours + triggered by interest
- **Capabilities**:
  - Complete website generation (HTML, CSS, JS)
  - Responsive, SEO-optimized code
  - Industry-specific design and content
  - Simulated deployment process

#### 4. Market Analytics Agent
- **Purpose**: Analyzes performance and identifies trends
- **Frequency**: Continuous monitoring
- **Capabilities**:
  - Regional performance tracking
  - Conversion rate analysis
  - Revenue projections
  - Market opportunity identification

---

## � Business Model
The platform supports multiple revenue streams:
- **SaaS Subscriptions**: Monthly recurring revenue for platform access
- **Commission-Based Services**: Percentage of implemented solutions
- **Premium Features**: Advanced analytics and automation tools
- **White-Label Solutions**: Customizable platform for agencies

---

## � Futture Enhancements

### Technical Roadmap
- [ ] Backend API development (Node.js/Python)
- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] User authentication and multi-tenancy
- [ ] Email integration for automated outreach
- [ ] Advanced analytics and reporting
- [ ] Mobile app development

### Business Features
- [ ] Automated email campaigns
- [ ] CRM integration capabilities
- [ ] Advanced lead scoring algorithms
- [ ] Multi-language support
- [ ] Industry-specific templates
- [ ] Integration with popular business tools

---

## 🏗️ Project Structure
```
├── components/           # React components
│   ├── Dashboard.tsx    # Lead management dashboard
│   ├── LeadSearch.tsx   # AI-powered business discovery
│   └── ProposalView.tsx # AI proposal generation
├── services/            # External service integrations
│   └── geminiService.ts # Google Gemini AI integration
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
└── index.tsx           # Application entry point
```

---

## 🎯 Use Cases
This project demonstrates:
- **AI Integration**: Practical implementation of LLM APIs
- **Business Intelligence**: Automated market analysis and opportunity identification
- **SaaS Development**: Scalable web application architecture
- **Lead Generation**: Modern sales and marketing automation
- **Academic Research**: AI-driven business process automation

---

## 👤 Author
**v uday**

---

## 📜 License
This project is intended for academic and research purposes.
