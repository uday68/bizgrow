import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cron from 'node-cron';
import path from 'path';

// Load environment variables from parent directory
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

// Import Database FIRST
import { initDatabase, getDatabase } from './database/init.js';

// Import AI Agents AFTER environment variables are loaded
import BusinessDiscoveryAgent from './agents/BusinessDiscoveryAgent.js';
import ProposalAgent from './agents/ProposalAgent.js';
import ProjectBuilderAgent from './agents/ProjectBuilderAgent.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://biggrow-production.up.railway.app',
        'https://bizgrow-ai-frontend.vercel.app',
        'https://bizgrow-ai.vercel.app',
        'https://bizgrow-ai-frontend.netlify.app',
        'https://bizgrow-ai.netlify.app',
        /\.vercel\.app$/,
        /\.netlify\.app$/,
        /\.github\.io$/
      ]
    : ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize AI Agents
const discoveryAgent = new BusinessDiscoveryAgent();
const proposalAgent = new ProposalAgent();
const builderAgent = new ProjectBuilderAgent();

// WebSocket for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected from WebSocket');
  });
});

// Broadcast to all connected clients
const broadcast = (data) => {
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'BizGrow AI Server',
    version: '1.0.0',
    description: 'AI-powered business automation platform',
    endpoints: {
      health: '/health',
      api: '/api',
      developer: '/api/developer/metrics'
    },
    documentation: 'https://github.com/your-repo/bizgrow-ai'
  });
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agents: {
      discovery: discoveryAgent.getStatus(),
      proposal: proposalAgent.getStatus(),
      builder: builderAgent.getStatus()
    },
    database: 'connected'
  });
});

// Developer Dashboard Metrics
app.get('/api/developer/metrics', async (req, res) => {
  try {
    const db = getDatabase();
    
    const totalDiscovered = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM businesses', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const proposalsSent = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM proposals WHERE status = "sent"', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const interestedResponses = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM proposals WHERE status = "interested"', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const projectsBuilt = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM projects WHERE status = "completed"', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    const recentActivity = await new Promise((resolve, reject) => {
      db.all(`
        SELECT type, business_name as business, created_at as timestamp, status 
        FROM activity_log 
        ORDER BY created_at DESC 
        LIMIT 20
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          ...row,
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date(row.timestamp).toLocaleString()
        })));
      });
    });

    res.json({
      totalDiscovered,
      proposalsSent,
      interestedResponses,
      projectsBuilt,
      activeRegions: ['New York', 'Los Angeles', 'Chicago', 'Austin'],
      peakSalesData: [
        { region: 'New York', revenue: 45200, growth: 18 },
        { region: 'Los Angeles', revenue: 32800, growth: 15 },
        { region: 'Chicago', revenue: 28400, growth: 22 },
        { region: 'Austin', revenue: 19600, growth: 25 }
      ],
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Agent Control Routes
app.post('/api/agents/:agentId/toggle', async (req, res) => {
  const { agentId } = req.params;
  
  try {
    let agent;
    switch (agentId) {
      case 'discovery':
        agent = discoveryAgent;
        break;
      case 'proposal':
        agent = proposalAgent;
        break;
      case 'builder':
        agent = builderAgent;
        break;
      default:
        return res.status(404).json({ error: 'Agent not found' });
    }

    const newStatus = agent.isActive ? 'idle' : 'active';
    agent.toggle();
    
    broadcast({
      type: 'agent_status_change',
      agentId,
      status: newStatus
    });

    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('Error toggling agent:', error);
    res.status(500).json({ error: 'Failed to toggle agent' });
  }
});

// Bulk Discovery Trigger
app.post('/api/agents/discovery/bulk-scan', async (req, res) => {
  const { regions } = req.body;
  
  try {
    // Start bulk discovery in background
    discoveryAgent.startBulkDiscovery(regions, (progress) => {
      broadcast({
        type: 'bulk_discovery_progress',
        progress
      });
    });

    res.json({ success: true, message: 'Bulk discovery started' });
  } catch (error) {
    console.error('Error starting bulk discovery:', error);
    res.status(500).json({ error: 'Failed to start bulk discovery' });
  }
});

// Business Discovery Routes
app.get('/api/businesses', async (req, res) => {
  try {
    const db = getDatabase();
    const businesses = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM businesses ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json(businesses);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Proposal Routes
app.post('/api/proposals/generate', async (req, res) => {
  const { businessId } = req.body;
  
  try {
    const proposal = await proposalAgent.generateProposal(businessId);
    
    broadcast({
      type: 'proposal_generated',
      businessId,
      proposal
    });

    res.json(proposal);
  } catch (error) {
    console.error('Error generating proposal:', error);
    res.status(500).json({ error: 'Failed to generate proposal' });
  }
});

// Project Building Routes
app.post('/api/projects/build', async (req, res) => {
  const { businessId, projectType } = req.body;
  
  try {
    const project = await builderAgent.buildProject(businessId, projectType);
    
    broadcast({
      type: 'project_build_started',
      businessId,
      projectId: project.id
    });

    res.json(project);
  } catch (error) {
    console.error('Error building project:', error);
    res.status(500).json({ error: 'Failed to build project' });
  }
});

// Automated Workflows

// Schedule automated business discovery every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running automated business discovery...');
  try {
    await discoveryAgent.runAutomatedDiscovery();
    broadcast({
      type: 'automated_discovery_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automated discovery failed:', error);
  }
});

// Schedule proposal generation every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running automated proposal generation...');
  try {
    await proposalAgent.runAutomatedProposals();
    broadcast({
      type: 'automated_proposals_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automated proposal generation failed:', error);
  }
});

// Schedule project building for interested businesses every 2 hours
cron.schedule('0 */2 * * *', async () => {
  console.log('Running automated project building...');
  try {
    await builderAgent.runAutomatedBuilding();
    broadcast({
      type: 'automated_building_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Automated building failed:', error);
  }
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    server.listen(PORT, HOST, () => {
      console.log(`🚀 BizGrow AI Server running on ${HOST}:${PORT}`);
      console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
      console.log(`🤖 AI Agents: Active and monitoring`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();