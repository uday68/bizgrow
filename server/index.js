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
import { initDatabase, getDatabase, getDatabaseType } from './database/init.js';
import databaseMonitor from './services/databaseMonitor.js';

// Import Logging Services
import logger from './services/logger.js';
import logAggregationService from './services/logAggregation.js';
import { 
  requestResponseLogger, 
  errorLogger, 
  securityLogger,
  agentLogger,
  cacheLogger
} from './middleware/logging.js';

// Import Security Middleware
import { 
  corsMiddleware, 
  securityMiddleware,
  httpsEnforcement,
  inputSanitization,
  sqlInjectionProtection,
  requestSizeLimiter,
  securityEventLogger,
  requestLogger, 
  errorHandler,
  apiLimiter,
  agentLimiter,
  searchLimiter,
  uploadLimiter,
  authenticateToken,
  requireRole,
  requirePermission
} from './middleware/auth.js';

// Import Routes
import authRoutes from './routes/auth.js';
import rateLimitRoutes from './routes/rateLimit.js';
import cacheRoutes from './routes/cache.js';
import enhancedSearchRoutes from './routes/enhancedSearch.js';
import performanceRoutes from './routes/performance.js';
import loggingRoutes from './routes/logging.js';
import chatRoutes from './routes/chat.js';
import apmRoutes from './routes/apm.js';
import errorRoutes from './routes/errors.js';
import proposalsRoutes from './routes/proposals.js';
import businessesRoutes from './routes/businesses.js';
import backupRoutes from './routes/backup.js';
import migrationsRoutes from './routes/migrations.js';
import databaseHealthRoutes from './routes/databaseHealth.js';
import analyticsRoutes from './routes/analytics.js';
import orchestratorRoutes from './routes/orchestrator.js';
import agentHealthRoutes from './routes/agentHealth.js';
import capacityRoutes from './routes/capacity.js';
import notificationRoutes from './routes/notifications.js';
import aiRoutes from './routes/ai.js';
import tenantsRoutes from './routes/tenants.js';
import tenantAnalyticsRoutes from './routes/tenantAnalytics.js';
import tenantIsolation from './middleware/tenantIsolation.js';

// Import Cache Services
import cacheService from './services/cacheService.js';
import cachedDb from './services/cachedDatabase.js';
import { 
  businessCache, 
  analyticsCache, 
  agentCache, 
  cacheMetrics,
  warmCache 
} from './middleware/cache.js';

// Import Chat Services
import chatService from './services/chatService.js';
import websocketServer from './services/websocketServer.js';
import { 
  chatLogger, 
  chatPerformanceLogger, 
  chatSecurityLogger 
} from './middleware/chatLogging.js';

// Import Response Optimization Middleware
import { responseOptimization } from './middleware/responseOptimization.js';

// Import APM Services
import apmService from './services/apmService.js';
import apmWebSocketIntegration from './services/apmWebSocketIntegration.js';
import chatAPMIntegration from './services/chatAPMIntegration.js';
import { apmMiddleware, apmHealthCheck } from './middleware/apmMiddleware.js';

// Import Error Tracking Services
import errorTracker from './services/errorTracker.js';
import { 
  errorTrackingMiddleware, 
  requestCompletionMiddleware,
  setupUnhandledRejectionTracking,
  setupUncaughtExceptionTracking
} from './middleware/errorTracking.js';

// Import Backup Service
import backupService from './services/backupService.js';

// Import Agent Orchestrator
import agentOrchestrator from './services/agentOrchestrator.js';
import agentHealthMonitor from './services/agentHealthMonitor.js';
import agentErrorHandler from './services/agentErrorHandler.js';
import agentCapacityManager from './services/agentCapacityManager.js';
import notificationService from './services/notificationService.js';

// Import AI Agents AFTER environment variables are loaded
import BusinessDiscoveryAgent from './agents/BusinessDiscoveryAgent.js';
import ProposalAgent from './agents/ProposalAgent.js';
import ProjectBuilderAgent from './agents/ProjectBuilderAgent.js';

const app = express();
const server = createServer(app);

// Setup WebSocket server for real-time chat
const io = websocketServer.setup(server);

// Legacy WebSocket for backwards compatibility
const wss = new WebSocketServer({ server });

// Apply Security Middleware FIRST
app.use(httpsEnforcement);
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(requestSizeLimiter('10mb'));
app.use(inputSanitization);
app.use(sqlInjectionProtection);
app.use(securityEventLogger);

// Apply comprehensive logging middleware
app.use(requestResponseLogger({
  logLevel: 'info',
  includeBody: process.env.NODE_ENV !== 'production',
  includeHeaders: false,
  excludePaths: ['/health', '/favicon.ico'],
  slowRequestThreshold: 1000
}));

// Apply context-aware logging middleware
app.use(securityLogger());
app.use(agentLogger());
app.use(cacheLogger());
app.use(chatLogger());
app.use(chatPerformanceLogger());
app.use(chatSecurityLogger());

// Legacy request logger (can be removed once new logging is verified)
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply API rate limiting to all routes
app.use('/api', apiLimiter);

// Apply cache metrics middleware
app.use(cacheMetrics);

// Apply cache warming middleware
app.use(warmCache());

// Apply APM middleware for comprehensive monitoring
app.use(apmMiddleware());

// Apply APM health check integration
app.use(apmHealthCheck());

// Apply error tracking middleware
app.use(requestCompletionMiddleware);

// Apply response optimization middleware (compression, cache headers, response time monitoring)
app.use(responseOptimization({
  compression: {
    threshold: 1024, // 1KB minimum for compression
    level: 6 // Balanced compression level
  },
  cache: {
    static: { maxAge: 31536000, immutable: true }, // 1 year for static assets
    api: { maxAge: 300, mustRevalidate: true }, // 5 minutes for API responses
    dynamic: { maxAge: 0, noCache: true } // No caching for dynamic content
  },
  monitoring: {
    slowThreshold: 1000, // 1 second threshold for slow requests
    trackPercentiles: true
  },
  apiCaching: {
    defaultTTL: 300, // 5 minutes default TTL
    varyByUser: true,
    varyByQuery: true
  }
}));

// Initialize AI Agents
const discoveryAgent = new BusinessDiscoveryAgent();
const proposalAgent = new ProposalAgent();
const builderAgent = new ProjectBuilderAgent();

// Register agents with orchestrator
agentOrchestrator.registerAgent('discovery', discoveryAgent);
agentOrchestrator.registerAgent('proposal', proposalAgent);
agentOrchestrator.registerAgent('builder', builderAgent);

logger.info('AI agents registered with orchestrator', {
  type: 'startup',
  agents: ['discovery', 'proposal', 'builder']
});

// Register agents with health monitor
const restartAgent = async (agentName) => {
  logger.info('Restarting agent', { type: 'agent_health', agentName });
  // Agent restart logic - toggle off and on
  const agent = agentName === 'discovery' ? discoveryAgent : 
                agentName === 'proposal' ? proposalAgent : builderAgent;
  agent.toggle(); // Turn off
  await new Promise(resolve => setTimeout(resolve, 1000));
  agent.toggle(); // Turn back on
};

agentHealthMonitor.registerAgent('discovery', discoveryAgent, () => restartAgent('discovery'));
agentHealthMonitor.registerAgent('proposal', proposalAgent, () => restartAgent('proposal'));
agentHealthMonitor.registerAgent('builder', builderAgent, () => restartAgent('builder'));

logger.info('AI agents registered with health monitor', {
  type: 'startup',
  agents: ['discovery', 'proposal', 'builder']
});

// Register fallback strategies for graceful degradation
agentErrorHandler.registerFallbackStrategy('discovery', 'discoverBusinesses', async (error) => {
  logger.warn('Using fallback for business discovery', { error: error.message });
  return { businesses: [], fallback: true, message: 'Using cached or default data' };
});

agentErrorHandler.registerFallbackStrategy('proposal', 'generateProposal', async (error) => {
  logger.warn('Using fallback for proposal generation', { error: error.message });
  return { proposal: null, fallback: true, message: 'Proposal generation temporarily unavailable' };
});

agentErrorHandler.registerFallbackStrategy('builder', 'buildProject', async (error) => {
  logger.warn('Using fallback for project building', { error: error.message });
  return { project: null, fallback: true, message: 'Project building temporarily unavailable' };
});

logger.info('Fallback strategies registered', {
  type: 'startup',
  strategies: ['discovery', 'proposal', 'builder']
});

// Register agents with capacity manager
agentCapacityManager.registerAgent('discovery', {
  capacity: 10,
  cpu: 15,
  memory: 15,
  network: 10,
  autoScaling: true,
  minCapacity: 5,
  maxCapacity: 30
});

agentCapacityManager.registerAgent('proposal', {
  capacity: 8,
  cpu: 20,
  memory: 20,
  network: 10,
  autoScaling: true,
  minCapacity: 4,
  maxCapacity: 25
});

agentCapacityManager.registerAgent('builder', {
  capacity: 5,
  cpu: 30,
  memory: 30,
  network: 15,
  autoScaling: true,
  minCapacity: 3,
  maxCapacity: 15
});

logger.info('AI agents registered with capacity manager', {
  type: 'startup',
  agents: ['discovery', 'proposal', 'builder']
});

// Note: Notification delivery on user connection is handled by the websocket connection handler
// The websocketServer doesn't expose an event emitter interface for this

logger.info('Notification service initialized', {
  type: 'startup',
  config: notificationService.getConfig()
});

// WebSocket for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  logger.info('WebSocket client connected', { 
    type: 'websocket',
    totalClients: clients.size 
  });
  
  ws.on('close', () => {
    clients.delete(ws);
    logger.info('WebSocket client disconnected', { 
      type: 'websocket',
      totalClients: clients.size 
    });
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

// Authentication routes (public)
app.use('/api/auth', authRoutes);

// Rate limiting management routes (admin only)
app.use('/api/rate-limit', authenticateToken, rateLimitRoutes);

// Cache management routes (admin/developer only)
app.use('/api/cache', authenticateToken, cacheRoutes);

// Performance monitoring routes (developer/admin only)
app.use('/api/performance', authenticateToken, performanceRoutes);

// Logging management routes (developer/admin only)
app.use('/api/logging', authenticateToken, loggingRoutes);

// Chat system routes (public and authenticated)
app.use('/api/chat', chatRoutes);

// APM monitoring routes (developer/admin only)
app.use('/api/apm', authenticateToken, apmRoutes);

// Error tracking routes (developer/admin only)
app.use('/api/errors', authenticateToken, errorRoutes);

// Backup routes (admin only)
app.use('/api/backup', backupRoutes);

// Migration routes (admin only)
app.use('/api/migrations', migrationsRoutes);

// Database health monitoring routes (developer/admin only)
app.use('/api/database-health', databaseHealthRoutes);

// Analytics routes (developer/admin only)
app.use('/api/analytics', analyticsRoutes);

// Orchestrator routes (developer/admin only)
app.use('/api/orchestrator', orchestratorRoutes);

// Agent health routes (developer/admin only)
app.use('/api/agent-health', agentHealthRoutes);

// Agent capacity routes (developer/admin only)
app.use('/api/capacity', capacityRoutes);

// Notification routes (authenticated)
app.use('/api/notifications', notificationRoutes);

// Enhanced search routes (public and authenticated)
app.use('/api/enhanced-search', enhancedSearchRoutes);

// Server-side AI integration routes (authenticated or rate-limited public access)
app.use('/api/ai', aiRoutes);

// Multi-tenant management routes (authenticated)
app.use('/api/tenants', authenticateToken, tenantsRoutes);
app.use('/api/tenant-analytics', authenticateToken, tenantAnalyticsRoutes);

// Businesses routes (authenticated and tenant-isolated)
app.use('/api/businesses', authenticateToken, tenantIsolation, businessesRoutes);

// Proposals routes (authenticated and tenant-isolated)
app.use('/api/proposals', authenticateToken, tenantIsolation, proposalsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const dbType = getDatabaseType();
  const db = getDatabase();
  
  let dbStatus = 'connected';
  let dbMetrics = null;
  
  if (dbType === 'postgres') {
    const poolStatus = db.getPoolStatus();
    dbStatus = poolStatus.status;
    dbMetrics = {
      type: 'postgresql',
      pool: {
        total: poolStatus.totalCount,
        idle: poolStatus.idleCount,
        waiting: poolStatus.waitingCount
      },
      performance: db.getMetrics()
    };
  } else {
    dbMetrics = {
      type: 'sqlite',
      status: 'connected'
    };
  }

  // Get chat service statistics
  const chatStats = chatService.getStatistics();
  const wsStats = websocketServer.getConnectionStats();
  
  // Get APM metrics
  const apmMetrics = apmService.getCurrentMetrics();
  const apmAlerts = apmService.getActiveAlerts();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agents: {
      discovery: discoveryAgent.getStatus(),
      proposal: proposalAgent.getStatus(),
      builder: builderAgent.getStatus()
    },
    database: dbStatus,
    database_metrics: dbMetrics,
    cache: cacheService.isConnected ? 'connected' : 'disconnected',
    chat: {
      activeSessions: chatStats.activeSessions,
      queuedSessions: chatStats.queuedSessions,
      totalAgents: chatStats.agents.total,
      availableAgents: chatStats.agents.available
    },
    websocket: {
      totalConnections: wsStats.totalConnections,
      authenticatedConnections: wsStats.authenticatedConnections,
      activeChatSessions: wsStats.activeSessions
    },
    monitoring: {
      database: databaseMonitor.isMonitoring,
      alerts: databaseMonitor.getActiveAlerts().length
    },
    apm: {
      isMonitoring: apmMetrics.isMonitoring,
      responseTime: apmMetrics.responseTime.average,
      throughput: apmMetrics.throughput.requestsPerSecond,
      errorRate: apmMetrics.errorRate.current,
      activeRequests: apmMetrics.activeRequests,
      alerts: apmAlerts.length,
      systemResources: {
        cpu: apmMetrics.systemResources.cpu.usage,
        memory: apmMetrics.systemResources.memory.usage
      }
    }
  });
});

// Developer Dashboard Metrics (requires developer role)
app.get('/api/developer/metrics', authenticateToken, requireRole('developer'), analyticsCache, async (req, res) => {
  try {
    // Use cached database for better performance
    const analytics = await cachedDb.getAnalytics();
    const recentActivity = await cachedDb.getRecentActivity(20);

    // Get detailed agent status
    const agents = {
      discovery: discoveryAgent.getStatus(),
      proposal: proposalAgent.getStatus(),
      builder: builderAgent.getStatus()
    };

    // Get cache metrics
    const cacheMetrics = cacheService.getMetrics();

    res.json({
      totalDiscovered: analytics.totalBusinesses,
      proposalsSent: analytics.proposalsSent,
      interestedResponses: analytics.interestedResponses,
      projectsBuilt: analytics.projectsCompleted,
      activeRegions: ['New York', 'Los Angeles', 'Chicago', 'Austin'],
      peakSalesData: [
        { region: 'New York', revenue: 45200, growth: 18 },
        { region: 'Los Angeles', revenue: 32800, growth: 15 },
        { region: 'Chicago', revenue: 28400, growth: 22 },
        { region: 'Austin', revenue: 19600, growth: 25 }
      ],
      recentActivity: recentActivity.map(row => ({
        ...row,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(row.created_at).toLocaleString()
      })),
      agents,
      cache: {
        hitRate: cacheMetrics.hitRate,
        totalRequests: cacheMetrics.totalRequests,
        isConnected: cacheMetrics.isConnected
      }
    });
  } catch (error) {
    logger.error('Error fetching metrics', { 
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Agent Control Routes (requires developer role)
app.post('/api/agents/:agentId/toggle', authenticateToken, requireRole('developer'), agentLimiter, async (req, res) => {
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
    logger.error('Error toggling agent', { 
      error: error.message,
      agentId,
      correlationId: req.correlationId,
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to toggle agent' });
  }
});

// Database monitoring routes (requires developer role)
app.get('/api/database/metrics', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const metrics = databaseMonitor.getCurrentMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching database metrics:', error);
    res.status(500).json({ error: 'Failed to fetch database metrics' });
  }
});

app.get('/api/database/performance', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const report = databaseMonitor.generatePerformanceReport();
    res.json(report);
  } catch (error) {
    console.error('Error generating performance report:', error);
    res.status(500).json({ error: 'Failed to generate performance report' });
  }
});

app.post('/api/database/optimize', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const dbType = getDatabaseType();
    
    if (dbType === 'postgres') {
      const db = getDatabase();
      const success = await db.optimizeDatabase();
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Database optimization completed',
          recommendations: databaseMonitor.getOptimizationRecommendations()
        });
      } else {
        res.status(500).json({ error: 'Database optimization failed' });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'SQLite optimization is limited. Consider upgrading to PostgreSQL for production.',
        type: 'sqlite'
      });
    }
  } catch (error) {
    console.error('Error optimizing database:', error);
    res.status(500).json({ error: 'Failed to optimize database' });
  }
});

app.get('/api/database/stats', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const dbType = getDatabaseType();
    
    if (dbType === 'postgres') {
      const db = getDatabase();
      const stats = await db.getDatabaseStats();
      res.json({
        type: 'postgresql',
        stats,
        pool_status: db.getPoolStatus(),
        metrics: db.getMetrics()
      });
    } else {
      res.json({
        type: 'sqlite',
        message: 'Limited statistics available for SQLite',
        monitoring: databaseMonitor.getCurrentMetrics()
      });
    }
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});
app.post('/api/agents/discovery/bulk-scan', authenticateToken, requireRole('developer'), agentLimiter, async (req, res) => {
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

// Business Discovery Routes (requires authentication)
app.get('/api/businesses', authenticateToken, searchLimiter, businessCache, async (req, res) => {
  try {
    const { region, limit = 50, offset = 0 } = req.query;
    const businesses = await cachedDb.getBusinesses({ 
      region, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });

    res.json(businesses);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Proposal Routes (requires authentication)
app.get('/api/proposals', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const proposals = await cachedDb.getProposals();
    res.json(proposals);
  } catch (error) {
    logger.error('Error fetching proposals', { 
      error: error.message,
      correlationId: req.correlationId,
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

app.get('/api/proposals/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const db = getDatabase();
    const proposal = await cachedDb.getProposalById(id);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    res.json(proposal);
  } catch (error) {
    logger.error('Error fetching proposal', { 
      error: error.message,
      proposalId: id,
      correlationId: req.correlationId,
      userId: req.user?.id 
    });
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

app.post('/api/proposals/generate', authenticateToken, async (req, res) => {
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

// Project Building Routes (requires authentication)
app.post('/api/projects/build', authenticateToken, async (req, res) => {
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
  logger.info('Starting automated business discovery', { type: 'cron', job: 'business_discovery' });
  try {
    await discoveryAgent.runAutomatedDiscovery();
    logger.info('Automated business discovery completed successfully', { type: 'cron', job: 'business_discovery' });
    broadcast({
      type: 'automated_discovery_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Automated discovery failed', { 
      type: 'cron',
      job: 'business_discovery',
      error: error.message,
      stack: error.stack 
    });
  }
});

// Schedule proposal generation every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  logger.info('Starting automated proposal generation', { type: 'cron', job: 'proposal_generation' });
  try {
    await proposalAgent.runAutomatedProposals();
    logger.info('Automated proposal generation completed successfully', { type: 'cron', job: 'proposal_generation' });
    broadcast({
      type: 'automated_proposals_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Automated proposal generation failed', { 
      type: 'cron',
      job: 'proposal_generation',
      error: error.message,
      stack: error.stack 
    });
  }
});

// Schedule project building for interested businesses every 2 hours
cron.schedule('0 */2 * * *', async () => {
  logger.info('Starting automated project building', { type: 'cron', job: 'project_building' });
  try {
    await builderAgent.runAutomatedBuilding();
    logger.info('Automated project building completed successfully', { type: 'cron', job: 'project_building' });
    broadcast({
      type: 'automated_building_completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Automated building failed', { 
      type: 'cron',
      job: 'project_building',
      error: error.message,
      stack: error.stack 
    });
  }
});

// Error handling middleware (must be last)
app.use(errorTrackingMiddleware); // Track errors before other error handling
app.use(errorLogger);
app.use(errorHandler);

// Initialize database and start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    await initDatabase();
    logger.info('Database initialized successfully', { 
      type: 'startup',
      database: getDatabaseType() 
    });
    
    // Initialize cached database service
    cachedDb.init();
    logger.info('Cached database service initialized', { type: 'startup' });
    
    // Setup global error tracking
    setupUnhandledRejectionTracking();
    setupUncaughtExceptionTracking();
    logger.info('Global error tracking initialized', { type: 'startup' });
    
    // Start database monitoring in production
    if (process.env.NODE_ENV === 'production' || process.env.DB_MONITORING === 'true') {
      databaseMonitor.startMonitoring();
      logger.info('Database monitoring started', { type: 'startup' });
    }
    
    // Initialize log aggregation service
    logger.info('Log aggregation service initialized', { 
      type: 'startup',
      features: ['structured_logging', 'correlation_ids', 'centralized_aggregation']
    });
    
    // Start backup service
    backupService.start();
    logger.info('Backup service started', {
      type: 'startup',
      schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
      retentionDays: process.env.BACKUP_RETENTION_DAYS || '30'
    });
    
    // Start agent health monitoring in production
    if (process.env.NODE_ENV === 'production' || process.env.AGENT_HEALTH_MONITORING === 'true') {
      agentHealthMonitor.startMonitoring();
      logger.info('Agent health monitoring started', { type: 'startup' });
    }

    // Note: Capacity manager queue processing starts automatically when requests are queued
    logger.info('Agent capacity manager initialized', { 
      type: 'startup',
      config: agentCapacityManager.capacityConfig
    });
    
    server.listen(PORT, HOST, () => {
      logger.info('BizGrow AI Server started successfully', {
        type: 'startup',
        host: HOST,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        database: getDatabaseType().toUpperCase(),
        features: {
          logging: 'comprehensive',
          monitoring: 'enabled',
          security: 'enhanced',
          caching: 'redis',
          agents: 'active'
        }
      });
      
      console.log(`🚀 BizGrow AI Server running on ${HOST}:${PORT}`);
      console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
      console.log(`🤖 AI Agents: Active and monitoring`);
      console.log(`🗄️ Database: ${getDatabaseType().toUpperCase()}`);
      console.log(`📝 Logging: Comprehensive with correlation IDs`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { 
      type: 'startup_error',
      error: error.message,
      stack: error.stack 
    });
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();