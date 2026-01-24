import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import chatService from '../services/chatService.js';
import logger from '../services/logger.js';

const router = express.Router();

// Create new chat session (public endpoint)
router.post('/sessions', async (req, res) => {
  try {
    const { customerInfo = {} } = req.body;
    
    // Generate customer ID if not provided
    const customerId = customerInfo.customerId || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request metadata
    const enrichedCustomerInfo = {
      ...customerInfo,
      customerId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referer')
    };
    
    const session = chatService.createSession(customerId, enrichedCustomerInfo);
    
    logger.chat('Chat session created via API', {
      sessionId: session.id,
      customerId,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Failed to create chat session', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create chat session'
    });
  }
});

// Get chat session (public endpoint with session validation)
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = chatService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Failed to get chat session', {
      error: error.message,
      sessionId: req.params.sessionId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat session'
    });
  }
});

// Send message in chat session (public endpoint)
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, senderType = 'customer', senderId, metadata = {} } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }
    
    // Add correlation ID to metadata
    const enrichedMetadata = {
      ...metadata,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    const message = await chatService.sendMessage(
      sessionId,
      senderId || 'anonymous',
      senderType,
      content.trim(),
      enrichedMetadata
    );
    
    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    logger.error('Failed to send chat message', {
      error: error.message,
      sessionId: req.params.sessionId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: error.message === 'Chat session not found' ? error.message : 'Failed to send message'
    });
  }
});

// Close chat session (public endpoint)
router.post('/sessions/:sessionId/close', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason = 'Session ended by customer' } = req.body;
    
    const session = chatService.closeSession(sessionId, 'customer', reason);
    
    logger.chat('Chat session closed via API', {
      sessionId,
      reason,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Failed to close chat session', {
      error: error.message,
      sessionId: req.params.sessionId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: error.message === 'Session not found' ? error.message : 'Failed to close session'
    });
  }
});

// Get customer chat history (requires authentication)
router.get('/customers/:customerId/sessions', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Users can only access their own chat history, admins can access any
    if (req.user.role !== 'admin' && req.user.id !== customerId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const sessions = chatService.getCustomerSessions(customerId);
    
    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    logger.error('Failed to get customer chat sessions', {
      error: error.message,
      customerId: req.params.customerId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat sessions'
    });
  }
});

// Support agent endpoints (require developer/admin role)

// Register as support agent
router.post('/agents/register', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const agentInfo = {
      name: req.user.name || req.user.email,
      email: req.user.email,
      maxSessions: req.body.maxSessions || 5,
      skills: req.body.skills || []
    };
    
    const agent = chatService.registerAgent(req.user.id, agentInfo);
    
    logger.chat('Support agent registered', {
      agentId: req.user.id,
      agentName: agent.name,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Failed to register support agent', {
      error: error.message,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to register as support agent'
    });
  }
});

// Update agent status
router.put('/agents/:agentId/status', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status } = req.body;
    
    // Agents can only update their own status, admins can update any
    if (req.user.role !== 'admin' && req.user.id !== agentId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: available, busy, or offline'
      });
    }
    
    chatService.updateAgentStatus(agentId, status);
    
    res.json({
      success: true,
      message: 'Agent status updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update agent status', {
      error: error.message,
      agentId: req.params.agentId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: error.message === 'Agent not found' ? error.message : 'Failed to update agent status'
    });
  }
});

// Assign agent to session
router.post('/sessions/:sessionId/assign', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { agentId } = req.body;
    
    // Use current user as agent if not specified
    const targetAgentId = agentId || req.user.id;
    
    const session = chatService.assignAgent(sessionId, targetAgentId);
    
    logger.chat('Agent assigned to session via API', {
      sessionId,
      agentId: targetAgentId,
      assignedBy: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Failed to assign agent to session', {
      error: error.message,
      sessionId: req.params.sessionId,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: error.message.includes('not found') ? error.message : 'Failed to assign agent'
    });
  }
});

// Get chat statistics (admin only)
router.get('/statistics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const statistics = chatService.getStatistics();
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    logger.error('Failed to get chat statistics', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat statistics'
    });
  }
});

// Search chat messages (developer/admin only)
router.post('/search', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    const results = chatService.searchMessages(query.trim(), filters);
    
    logger.chat('Chat messages searched', {
      query,
      filters,
      resultCount: results.length,
      userId: req.user.id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      data: {
        query,
        filters,
        results,
        count: results.length
      }
    });
  } catch (error) {
    logger.error('Failed to search chat messages', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to search chat messages'
    });
  }
});

// Get all active sessions (developer/admin only)
router.get('/sessions', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const { status, agentId, limit = 50 } = req.query;
    
    const allSessions = [];
    for (const [sessionId, session] of chatService.activeSessions) {
      // Apply filters
      if (status && session.status !== status) continue;
      if (agentId && session.assignedAgent !== agentId) continue;
      
      allSessions.push({
        ...session,
        messages: chatService.messageHistory.get(sessionId) || []
      });
    }
    
    // Sort by creation date (newest first) and limit
    const sortedSessions = allSessions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        sessions: sortedSessions,
        total: allSessions.length,
        filters: { status, agentId, limit }
      }
    });
  } catch (error) {
    logger.error('Failed to get chat sessions', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat sessions'
    });
  }
});

// Get session queue (developer/admin only)
router.get('/queue', authenticateToken, requireRole('developer'), async (req, res) => {
  try {
    const queueData = chatService.sessionQueue.map(sessionId => {
      const session = chatService.activeSessions.get(sessionId);
      return session ? {
        sessionId,
        customerId: session.customerId,
        customerName: session.customerInfo.name,
        waitTime: Date.now() - session.createdAt.getTime(),
        createdAt: session.createdAt
      } : null;
    }).filter(Boolean);
    
    res.json({
      success: true,
      data: {
        queue: queueData,
        length: queueData.length,
        averageWaitTime: chatService.calculateAverageWaitTime()
      }
    });
  } catch (error) {
    logger.error('Failed to get session queue', {
      error: error.message,
      correlationId: req.correlationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session queue'
    });
  }
});

export default router;