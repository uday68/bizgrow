#!/usr/bin/env node

/**
 * APM Chat Integration Demo
 * Demonstrates how the APM system monitors chat system performance
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock the required services for demo
const mockLogger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
  debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta || ''),
  chat: (msg, meta) => console.log(`[CHAT] ${msg}`, meta || ''),
  performance: (msg, meta) => console.log(`[PERF] ${msg}`, meta || ''),
  business: (msg, meta) => console.log(`[BUSINESS] ${msg}`, meta || '')
};

const mockCacheService = {
  set: async () => true,
  get: async () => null,
  isConnected: true
};

// Simple APM service for demo
class DemoAPMService {
  constructor() {
    this.metrics = {
      responseTime: { current: 0, average: 0, samples: [] },
      throughput: { requestsPerSecond: 0, totalRequests: 0 },
      errorRate: { current: 0, errors: 0, total: 0 },
      business: { chatSessions: 0, activeUsers: 0 }
    };
    this.activeRequests = new Map();
    this.requestHistory = [];
  }

  trackRequestStart(req) {
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      path: req.path,
      method: req.method
    });
    req.requestId = requestId;
  }

  trackRequestEnd(req, res) {
    const requestData = this.activeRequests.get(req.requestId);
    if (!requestData) return;

    const responseTime = Date.now() - requestData.startTime;
    
    // Update metrics
    this.metrics.throughput.totalRequests++;
    this.metrics.responseTime.samples.push(responseTime);
    this.metrics.responseTime.current = responseTime;
    
    if (this.metrics.responseTime.samples.length > 0) {
      this.metrics.responseTime.average = 
        this.metrics.responseTime.samples.reduce((sum, time) => sum + time, 0) / 
        this.metrics.responseTime.samples.length;
    }

    // Track errors
    if (res.statusCode >= 400) {
      this.metrics.errorRate.errors++;
    }
    this.metrics.errorRate.total++;
    this.metrics.errorRate.current = this.metrics.errorRate.errors / this.metrics.errorRate.total;

    // Store request
    this.requestHistory.push({
      ...requestData,
      responseTime,
      statusCode: res.statusCode,
      endTime: Date.now()
    });

    // Clean up
    this.activeRequests.delete(req.requestId);

    // Log performance
    mockLogger.performance(`Request completed: ${req.method} ${req.path} - ${res.statusCode} (${responseTime}ms)`);
  }

  trackBusinessMetric(metricName, data) {
    mockLogger.business(`Business metric: ${metricName}`, data);
    
    if (metricName.includes('chat')) {
      this.metrics.business.chatSessions++;
    }
  }

  getCurrentMetrics() {
    return {
      timestamp: new Date().toISOString(),
      ...this.metrics,
      activeRequests: this.activeRequests.size
    };
  }
}

// Simple chat service for demo
class DemoChatService {
  constructor() {
    this.sessions = new Map();
    this.messages = new Map();
  }

  createSession(customerId, customerInfo) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      customerId,
      customerInfo,
      status: 'waiting',
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    this.messages.set(sessionId, []);

    mockLogger.chat('Session created', { sessionId, customerId });
    return session;
  }

  sendMessage(sessionId, senderId, senderType, content) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      id: messageId,
      sessionId,
      senderId,
      senderType,
      content,
      timestamp: new Date()
    };

    const messages = this.messages.get(sessionId) || [];
    messages.push(message);
    this.messages.set(sessionId, messages);

    // Update session activity
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }

    mockLogger.chat('Message sent', { sessionId, messageId, senderType });
    return message;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      ...session,
      messages: this.messages.get(sessionId) || []
    };
  }

  getStatistics() {
    return {
      activeSessions: this.sessions.size,
      totalMessages: Array.from(this.messages.values()).reduce((sum, msgs) => sum + msgs.length, 0)
    };
  }
}

// Initialize services
const apmService = new DemoAPMService();
const chatService = new DemoChatService();

// APM middleware
const apmMiddleware = () => {
  return (req, res, next) => {
    // Track request start
    apmService.trackRequestStart(req);

    // Add business metric tracking helper
    req.trackBusinessMetric = (metricName, data) => {
      apmService.trackBusinessMetric(metricName, data);
    };

    // Override response methods to track completion
    const originalSend = res.send;
    const originalJson = res.json;

    let responseSent = false;
    const trackCompletion = () => {
      if (responseSent) return;
      responseSent = true;
      apmService.trackRequestEnd(req, res);
    };

    res.send = function(body) {
      trackCompletion();
      return originalSend.call(this, body);
    };

    res.json = function(obj) {
      trackCompletion();
      return originalJson.call(this, obj);
    };

    next();
  };
};

// Create Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
app.use(apmMiddleware());

// Add performance headers
app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  const originalSend = res.send;
  res.send = function(body) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
    res.set('X-Request-ID', req.requestId);
    
    return originalSend.call(this, body);
  };
  
  next();
});

// Routes

// APM Dashboard endpoint
app.get('/api/apm/metrics', (req, res) => {
  const metrics = apmService.getCurrentMetrics();
  res.json({
    success: true,
    data: metrics
  });
});

// Chat session creation
app.post('/api/chat/sessions', (req, res) => {
  const { customerInfo = {} } = req.body;
  const customerId = customerInfo.customerId || `customer_${Date.now()}`;
  
  const session = chatService.createSession(customerId, customerInfo);
  
  // Track business metric
  req.trackBusinessMetric('chat_session_created', {
    sessionId: session.id,
    customerId
  });
  
  res.json({
    success: true,
    data: session
  });
});

// Send chat message
app.post('/api/chat/sessions/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  const { content, senderType = 'customer', senderId = 'anonymous' } = req.body;
  
  try {
    const message = chatService.sendMessage(sessionId, senderId, senderType, content);
    
    // Track business metric
    req.trackBusinessMetric('chat_message_sent', {
      sessionId,
      messageId: message.id,
      senderType,
      contentLength: content.length
    });
    
    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chat session
app.get('/api/chat/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = chatService.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }
  
  res.json({
    success: true,
    data: session
  });
});

// Chat statistics
app.get('/api/chat/statistics', (req, res) => {
  const stats = chatService.getStatistics();
  res.json({
    success: true,
    data: stats
  });
});

// Test endpoints for demonstration
app.get('/api/test/fast', (req, res) => {
  res.json({ message: 'Fast response', timestamp: new Date().toISOString() });
});

app.get('/api/test/slow', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'Slow response', timestamp: new Date().toISOString() });
  }, 1500);
});

app.get('/api/test/error', (req, res) => {
  res.status(500).json({ error: 'Simulated error', timestamp: new Date().toISOString() });
});

// Health check
app.get('/health', (req, res) => {
  const metrics = apmService.getCurrentMetrics();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apm: {
      totalRequests: metrics.throughput.totalRequests,
      averageResponseTime: metrics.responseTime.average,
      errorRate: metrics.errorRate.current,
      activeRequests: metrics.activeRequests
    },
    chat: chatService.getStatistics()
  });
});

// Serve demo HTML page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APM Chat Integration Demo</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .metric { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { font-size: 14px; color: #666; margin-top: 5px; }
        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .btn-danger { background: #dc3545; color: white; }
        .response { margin: 10px 0; padding: 10px; background: #e9ecef; border-radius: 4px; font-family: monospace; }
        .chat-demo { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        input, textarea { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; }
        .messages { height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; background: white; }
        .message { margin: 5px 0; padding: 5px; border-radius: 4px; }
        .message.customer { background: #e3f2fd; }
        .message.agent { background: #f3e5f5; }
    </style>
</head>
<body>
    <div class="container">
        <h1>APM Chat Integration Demo</h1>
        <p>This demo shows how the APM system monitors chat system performance in real-time.</p>
        
        <div class="card">
            <h2>Current APM Metrics</h2>
            <div class="metrics" id="metrics">
                <div class="metric">
                    <div class="metric-value" id="totalRequests">0</div>
                    <div class="metric-label">Total Requests</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="avgResponseTime">0ms</div>
                    <div class="metric-label">Avg Response Time</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="errorRate">0%</div>
                    <div class="metric-label">Error Rate</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="activeRequests">0</div>
                    <div class="metric-label">Active Requests</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="chatSessions">0</div>
                    <div class="metric-label">Chat Sessions</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Test APM Tracking</h2>
            <button class="btn-primary" onclick="testFastRequest()">Fast Request</button>
            <button class="btn-warning" onclick="testSlowRequest()">Slow Request</button>
            <button class="btn-danger" onclick="testErrorRequest()">Error Request</button>
            <button class="btn-success" onclick="refreshMetrics()">Refresh Metrics</button>
            <div id="testResponse" class="response" style="display: none;"></div>
        </div>

        <div class="card">
            <h2>Chat System Demo</h2>
            <div class="chat-demo">
                <div>
                    <h3>Create Chat Session</h3>
                    <input type="text" id="customerName" placeholder="Customer Name" value="John Doe">
                    <input type="email" id="customerEmail" placeholder="Customer Email" value="john@example.com">
                    <button class="btn-primary" onclick="createChatSession()">Create Session</button>
                    <div id="sessionInfo" class="response" style="display: none;"></div>
                </div>
                <div>
                    <h3>Send Messages</h3>
                    <input type="text" id="sessionId" placeholder="Session ID" readonly>
                    <textarea id="messageContent" placeholder="Type your message..." rows="3"></textarea>
                    <button class="btn-success" onclick="sendMessage()">Send Message</button>
                    <div class="messages" id="messages"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentSessionId = null;

        async function testFastRequest() {
            showResponse('Making fast request...');
            try {
                const response = await fetch('/api/test/fast');
                const data = await response.json();
                showResponse('Fast request completed: ' + JSON.stringify(data, null, 2));
                setTimeout(refreshMetrics, 100);
            } catch (error) {
                showResponse('Error: ' + error.message);
            }
        }

        async function testSlowRequest() {
            showResponse('Making slow request (1.5s delay)...');
            try {
                const response = await fetch('/api/test/slow');
                const data = await response.json();
                showResponse('Slow request completed: ' + JSON.stringify(data, null, 2));
                setTimeout(refreshMetrics, 100);
            } catch (error) {
                showResponse('Error: ' + error.message);
            }
        }

        async function testErrorRequest() {
            showResponse('Making error request...');
            try {
                const response = await fetch('/api/test/error');
                const data = await response.json();
                showResponse('Error request completed: ' + JSON.stringify(data, null, 2));
                setTimeout(refreshMetrics, 100);
            } catch (error) {
                showResponse('Error: ' + error.message);
            }
        }

        async function refreshMetrics() {
            try {
                const response = await fetch('/api/apm/metrics');
                const result = await response.json();
                const metrics = result.data;

                document.getElementById('totalRequests').textContent = metrics.throughput.totalRequests;
                document.getElementById('avgResponseTime').textContent = Math.round(metrics.responseTime.average) + 'ms';
                document.getElementById('errorRate').textContent = (metrics.errorRate.current * 100).toFixed(1) + '%';
                document.getElementById('activeRequests').textContent = metrics.activeRequests;
                document.getElementById('chatSessions').textContent = metrics.business.chatSessions;
            } catch (error) {
                console.error('Failed to refresh metrics:', error);
            }
        }

        async function createChatSession() {
            const customerName = document.getElementById('customerName').value;
            const customerEmail = document.getElementById('customerEmail').value;

            try {
                const response = await fetch('/api/chat/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerInfo: { name: customerName, email: customerEmail }
                    })
                });

                const result = await response.json();
                if (result.success) {
                    currentSessionId = result.data.id;
                    document.getElementById('sessionId').value = currentSessionId;
                    document.getElementById('sessionInfo').style.display = 'block';
                    document.getElementById('sessionInfo').textContent = 'Session created: ' + JSON.stringify(result.data, null, 2);
                    setTimeout(refreshMetrics, 100);
                }
            } catch (error) {
                document.getElementById('sessionInfo').style.display = 'block';
                document.getElementById('sessionInfo').textContent = 'Error: ' + error.message;
            }
        }

        async function sendMessage() {
            if (!currentSessionId) {
                alert('Please create a chat session first');
                return;
            }

            const content = document.getElementById('messageContent').value;
            if (!content.trim()) {
                alert('Please enter a message');
                return;
            }

            try {
                const response = await fetch('/api/chat/sessions/' + currentSessionId + '/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: content,
                        senderType: 'customer',
                        senderId: 'demo-customer'
                    })
                });

                const result = await response.json();
                if (result.success) {
                    addMessageToChat(result.data);
                    document.getElementById('messageContent').value = '';
                    setTimeout(refreshMetrics, 100);
                }
            } catch (error) {
                console.error('Failed to send message:', error);
            }
        }

        function addMessageToChat(message) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + message.senderType;
            messageDiv.innerHTML = '<strong>' + message.senderType + ':</strong> ' + message.content;
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function showResponse(text) {
            const responseDiv = document.getElementById('testResponse');
            responseDiv.style.display = 'block';
            responseDiv.textContent = text;
        }

        // Auto-refresh metrics every 5 seconds
        setInterval(refreshMetrics, 5000);
        
        // Initial load
        refreshMetrics();
    </script>
</body>
</html>
  `);
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 APM Chat Integration Demo running on http://localhost:${PORT}`);
  console.log(`📊 APM Metrics: http://localhost:${PORT}/api/apm/metrics`);
  console.log(`💬 Chat API: http://localhost:${PORT}/api/chat/sessions`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Demo Features:');
  console.log('- Real-time APM metrics tracking');
  console.log('- Chat system performance monitoring');
  console.log('- Request/response time measurement');
  console.log('- Error rate tracking');
  console.log('- Business metrics integration');
  console.log('');
  console.log('Try the interactive demo at http://localhost:' + PORT);
});

export default {};