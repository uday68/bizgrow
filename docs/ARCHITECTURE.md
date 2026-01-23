# BizGrow AI - System Architecture Documentation

## 🏗️ System Overview

BizGrow AI is an intelligent lead generation platform that leverages Google's advanced AI and mapping technologies to automate business discovery, proposal generation, and project deployment.

## 📊 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BizGrow AI Platform                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Frontend      │    │   Backend       │    │   AI Agents     │            │
│  │   Dashboard     │◄──►│   API Server    │◄──►│   Orchestrator  │            │
│  │                 │    │                 │    │                 │            │
│  │ • React 19      │    │ • Node.js       │    │ • Discovery     │            │
│  │ • TypeScript    │    │ • Express       │    │ • Proposal      │            │
│  │ • Tailwind CSS  │    │ • WebSocket     │    │ • Builder       │            │
│  │ • Vite          │    │ • SQLite        │    │ • Analytics     │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│           │                       │                       │                    │
│           │                       │                       │                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        Google Services Integration                          │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  │  Google Gemini  │    │  Google Maps    │    │  Google Cloud   │        │
│  │  │      AI         │    │      API        │    │   (Future)      │        │
│  │  │                 │    │                 │    │                 │        │
│  │  │ • 2.5-flash     │    │ • Places API    │    │ • Compute       │        │
│  │  │ • 3-flash       │    │ • Geocoding     │    │ • Storage       │        │
│  │  │ • Grounding     │    │ • Reviews       │    │ • Functions     │        │
│  │  │ • JSON Schema   │    │ • Photos        │    │ • AI Platform   │        │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘        │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🤖 AI Agent Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            AI Agent Orchestration                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Discovery     │    │   Proposal      │    │   Builder       │            │
│  │     Agent       │───►│     Agent       │───►│     Agent       │            │
│  │                 │    │                 │    │                 │            │
│  │ • Google Maps   │    │ • Gemini AI     │    │ • Code Gen      │            │
│  │ • Gemini AI     │    │ • Email Send    │    │ • Deployment    │            │
│  │ • Opportunity   │    │ • Response      │    │ • Monitoring    │            │
│  │   Scoring       │    │   Tracking      │    │                 │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│           │                       │                       │                    │
│           ▼                       ▼                       ▼                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        Shared Data Layer                                   │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  │ Businesses  │  │ Proposals   │  │ Projects    │  │ Analytics   │      │
│  │  │   Table     │  │   Table     │  │   Table     │  │   Table     │      │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🌐 Google Technologies Integration

### Google Gemini AI Integration
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Gemini AI Integration Flow                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   User Query    │───►│   Gemini API    │───►│   Structured    │            │
│  │                 │    │                 │    │    Response     │            │
│  │ • Search Terms  │    │ • Model: 2.5    │    │ • JSON Schema   │            │
│  │ • Location      │    │ • Grounding     │    │ • Validated     │            │
│  │ • Filters       │    │ • Maps Tool     │    │ • Typed Data    │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                   │                                            │
│                                   ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        Response Processing                                  │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  │ Business    │  │ Contact     │  │ Digital     │  │ Opportunity │      │
│  │  │ Details     │  │ Info        │  │ Presence    │  │ Score       │      │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Google Maps API Integration
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Maps API Integration Flow                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Location      │───►│   Places API    │───►│   Business      │            │
│  │   Context       │    │                 │    │   Metadata      │            │
│  │                 │    │ • Nearby Search │    │                 │            │
│  │ • Coordinates   │    │ • Place Details │    │ • Reviews       │            │
│  │ • Radius        │    │ • Photos        │    │ • Ratings       │            │
│  │ • Categories    │    │ • Reviews       │    │ • Hours         │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                   │                                            │
│                                   ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        Grounding & Verification                             │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  │ Real Data   │  │ Verified    │  │ Current     │  │ Actionable  │      │
│  │  │ Sources     │  │ Locations   │  │ Status      │  │ Insights    │      │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Data Flow Diagram                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐                                                           │
│  │   User Input    │                                                           │
│  │                 │                                                           │
│  │ • Search Query  │                                                           │
│  │ • Location      │                                                           │
│  │ • Preferences   │                                                           │
│  └─────────┬───────┘                                                           │
│            │                                                                   │
│            ▼                                                                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Discovery     │───►│   Google APIs   │───►│   Data Store    │            │
│  │     Agent       │    │                 │    │                 │            │
│  │                 │    │ • Gemini AI     │    │ • SQLite DB     │            │
│  │ • Query Proc.   │    │ • Maps API      │    │ • File System   │            │
│  │ • Validation    │    │ • Grounding     │    │ • Cache Layer   │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│            │                       │                       │                    │
│            ▼                       ▼                       ▼                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Proposal      │    │   Analytics     │    │   Real-time     │            │
│  │     Agent       │    │     Engine      │    │    Updates      │            │
│  │                 │    │                 │    │                 │            │
│  │ • AI Generation │    │ • Performance   │    │ • WebSocket     │            │
│  │ • Email Send    │    │ • Trends        │    │ • Live Feed     │            │
│  │ • Response      │    │ • Predictions   │    │ • Notifications │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│            │                       │                       │                    │
│            ▼                       ▼                       ▼                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Builder       │    │   Dashboard     │    │   Monitoring    │            │
│  │     Agent       │    │     UI          │    │    & Alerts     │            │
│  │                 │    │                 │    │                 │            │
│  │ • Code Gen      │    │ • Metrics       │    │ • Health Check  │            │
│  │ • Deployment    │    │ • Controls      │    │ • Error Track   │            │
│  │ • Monitoring    │    │ • Analytics     │    │ • Performance   │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🗄️ Database Schema

```sql
-- Business Discovery & Management
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  email TEXT,
  rating REAL,
  review_count INTEGER,
  maps_url TEXT,
  region TEXT,
  industry TEXT,
  digital_presence_score INTEGER DEFAULT 0,
  opportunity_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'discovered',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI-Generated Proposals
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  sent_at DATETIME,
  response_at DATETIME,
  interest_level INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id)
);

-- Automated Project Building
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  proposal_id TEXT,
  project_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  build_progress INTEGER DEFAULT 0,
  deployment_url TEXT,
  estimated_completion DATETIME,
  actual_completion DATETIME,
  revenue REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses (id),
  FOREIGN KEY (proposal_id) REFERENCES proposals (id)
);

-- System Activity Tracking
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  business_name TEXT,
  business_id TEXT,
  description TEXT,
  status TEXT DEFAULT 'success',
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI Agent Monitoring
CREATE TABLE agent_status (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  current_task TEXT,
  tasks_completed INTEGER DEFAULT 0,
  performance_score INTEGER DEFAULT 100,
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Regional Performance Analytics
CREATE TABLE regional_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  businesses_discovered INTEGER DEFAULT 0,
  proposals_sent INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE
);
```

## 🔧 Technology Stack Details

### Frontend Technologies
- **React 19.2.3**: Latest React with concurrent features
- **TypeScript 5.8**: Type safety and developer experience
- **Vite 6.2**: Fast build tool and dev server
- **Tailwind CSS 4.1**: Utility-first CSS framework
- **Lucide React**: Modern icon library
- **React Router 7.11**: Client-side routing

### Backend Technologies
- **Node.js**: JavaScript runtime
- **Express.js**: Web application framework
- **WebSocket**: Real-time communication
- **SQLite3**: Embedded database
- **Node-cron**: Scheduled task automation
- **Nodemailer**: Email delivery system

### Google Services Integration
- **Google Gemini AI**: Advanced language models
  - `gemini-2.5-flash`: Fast business discovery
  - `gemini-3-flash-preview`: Complex proposal generation
- **Google Maps API**: Real business data
  - Places API for business discovery
  - Geocoding for location services
  - Reviews and ratings integration

### Development Tools
- **ESM Modules**: Modern JavaScript modules
- **Concurrently**: Parallel process management
- **Hot Reload**: Development efficiency
- **TypeScript Strict Mode**: Code quality

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Deployment Strategy                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│  │   Development   │    │   Staging       │    │   Production    │            │
│  │   Environment   │───►│   Environment   │───►│   Environment   │            │
│  │                 │    │                 │    │                 │            │
│  │ • Local Dev     │    │ • Testing       │    │ • Google Cloud  │            │
│  │ • Hot Reload    │    │ • Integration   │    │ • Auto Scaling  │            │
│  │ • Debug Mode    │    │ • Performance   │    │ • Load Balance  │            │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘            │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┤
│  │                        Google Cloud Services                                │
│  ├─────────────────────────────────────────────────────────────────────────────┤
│  │                                                                             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  │ Compute     │  │ Storage     │  │ AI Platform │  │ Monitoring  │      │
│  │  │ Engine      │  │ Buckets     │  │ Vertex AI   │  │ & Logging   │      │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│  └─────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 📊 Performance Metrics

### System Performance Targets
- **Response Time**: < 2 seconds for business discovery
- **Throughput**: 100+ businesses processed per minute
- **Availability**: 99.9% uptime
- **Scalability**: Handle 10,000+ concurrent users

### AI Performance Metrics
- **Discovery Accuracy**: > 95% relevant businesses
- **Proposal Quality**: > 85% interest rate
- **Build Success**: > 98% successful deployments
- **Response Time**: < 5 seconds for AI operations

## 🔒 Security & Privacy

### Data Protection
- **API Key Security**: Environment variable management
- **Data Encryption**: In-transit and at-rest encryption
- **Access Control**: Role-based permissions
- **Audit Logging**: Comprehensive activity tracking

### Google API Compliance
- **Rate Limiting**: Respect API quotas and limits
- **Terms of Service**: Full compliance with Google ToS
- **Data Usage**: Appropriate use of business data
- **Privacy**: GDPR and privacy regulation compliance