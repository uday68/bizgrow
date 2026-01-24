import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

// Chat service for managing customer support conversations
class ChatService extends EventEmitter {
  constructor() {
    super();
    this.activeSessions = new Map(); // sessionId -> session data
    this.messageHistory = new Map(); // sessionId -> messages array
    this.supportAgents = new Map(); // agentId -> agent data
    this.sessionQueue = []; // Queue for unassigned sessions
    
    // Initialize service
    this.initialize();
  }

  initialize() {
    logger.info('Chat service initializing', {
      type: 'chat',
      category: 'service_startup'
    });

    // Clean up inactive sessions every 30 minutes
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 30 * 60 * 1000);

    // Log service metrics every 5 minutes
    setInterval(() => {
      this.logMetrics();
    }, 5 * 60 * 1000);
  }

  // Create new chat session
  createSession(customerId, customerInfo = {}) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      customerId,
      customerInfo: {
        name: customerInfo.name || 'Anonymous',
        email: customerInfo.email || null,
        ...customerInfo
      },
      status: 'waiting', // waiting, active, closed
      assignedAgent: null,
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: {
        userAgent: customerInfo.userAgent,
        ip: customerInfo.ip,
        referrer: customerInfo.referrer
      }
    };

    this.activeSessions.set(sessionId, session);
    this.messageHistory.set(sessionId, []);

    // Add to queue for agent assignment
    this.sessionQueue.push(sessionId);

    logger.chat('New chat session created', {
      sessionId,
      customerId,
      customerName: session.customerInfo.name,
      queuePosition: this.sessionQueue.length
    });

    // Emit event for real-time updates
    this.emit('sessionCreated', session);

    // Try to assign agent immediately
    this.tryAssignAgent(sessionId);

    return session;
  }

  // Send message in chat session
  async sendMessage(sessionId, senderId, senderType, content, metadata = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    const messageId = uuidv4();
    const message = {
      id: messageId,
      sessionId,
      senderId,
      senderType, // 'customer', 'agent', 'system'
      content,
      timestamp: new Date(),
      metadata: {
        correlationId: metadata.correlationId,
        ...metadata
      }
    };

    // Add message to history
    const messages = this.messageHistory.get(sessionId) || [];
    messages.push(message);
    this.messageHistory.set(sessionId, messages);

    // Update session activity
    session.lastActivity = new Date();

    logger.chat('Message sent', {
      sessionId,
      messageId,
      senderId,
      senderType,
      contentLength: content.length,
      correlationId: metadata.correlationId
    });

    // Emit event for real-time delivery
    this.emit('messageReceived', {
      sessionId,
      message,
      session
    });

    // Auto-responses for system messages
    if (senderType === 'system') {
      this.handleSystemMessage(sessionId, message);
    }

    return message;
  }

  // Get chat session
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      ...session,
      messages: this.messageHistory.get(sessionId) || []
    };
  }

  // Get all sessions for a customer
  getCustomerSessions(customerId) {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions) {
      if (session.customerId === customerId) {
        sessions.push({
          ...session,
          messages: this.messageHistory.get(sessionId) || []
        });
      }
    }
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Assign agent to session
  assignAgent(sessionId, agentId) {
    const session = this.activeSessions.get(sessionId);
    const agent = this.supportAgents.get(agentId);

    if (!session || !agent) {
      throw new Error('Session or agent not found');
    }

    session.assignedAgent = agentId;
    session.status = 'active';
    session.lastActivity = new Date();

    // Remove from queue
    const queueIndex = this.sessionQueue.indexOf(sessionId);
    if (queueIndex > -1) {
      this.sessionQueue.splice(queueIndex, 1);
    }

    logger.chat('Agent assigned to session', {
      sessionId,
      agentId,
      agentName: agent.name,
      customerId: session.customerId
    });

    // Send system message
    this.sendMessage(sessionId, 'system', 'system', 
      `${agent.name} has joined the conversation and will assist you.`
    );

    this.emit('agentAssigned', { sessionId, agentId, session });

    return session;
  }

  // Try to assign available agent
  tryAssignAgent(sessionId) {
    if (this.sessionQueue.length === 0) return;

    // Find available agent
    const availableAgent = this.findAvailableAgent();
    if (availableAgent) {
      this.assignAgent(sessionId, availableAgent.id);
    }
  }

  // Find available support agent
  findAvailableAgent() {
    for (const [agentId, agent] of this.supportAgents) {
      if (agent.status === 'available' && agent.activeSessions < agent.maxSessions) {
        return agent;
      }
    }
    return null;
  }

  // Register support agent
  registerAgent(agentId, agentInfo) {
    const agent = {
      id: agentId,
      name: agentInfo.name,
      email: agentInfo.email,
      status: 'available', // available, busy, offline
      activeSessions: 0,
      maxSessions: agentInfo.maxSessions || 5,
      skills: agentInfo.skills || [],
      lastActivity: new Date(),
      connectedAt: new Date()
    };

    this.supportAgents.set(agentId, agent);

    logger.chat('Support agent registered', {
      agentId,
      agentName: agent.name,
      maxSessions: agent.maxSessions
    });

    // Try to assign queued sessions
    this.processSessionQueue();

    return agent;
  }

  // Update agent status
  updateAgentStatus(agentId, status) {
    const agent = this.supportAgents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const oldStatus = agent.status;
    agent.status = status;
    agent.lastActivity = new Date();

    logger.chat('Agent status updated', {
      agentId,
      agentName: agent.name,
      oldStatus,
      newStatus: status
    });

    // If agent becomes available, process queue
    if (status === 'available' && oldStatus !== 'available') {
      this.processSessionQueue();
    }

    this.emit('agentStatusChanged', { agentId, status, agent });
  }

  // Process session queue
  processSessionQueue() {
    while (this.sessionQueue.length > 0) {
      const sessionId = this.sessionQueue[0];
      const availableAgent = this.findAvailableAgent();
      
      if (!availableAgent) break;
      
      this.assignAgent(sessionId, availableAgent.id);
    }
  }

  // Close chat session
  closeSession(sessionId, closedBy, reason = 'Session ended') {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'closed';
    session.closedAt = new Date();
    session.closedBy = closedBy;
    session.closeReason = reason;

    // Update agent availability
    if (session.assignedAgent) {
      const agent = this.supportAgents.get(session.assignedAgent);
      if (agent) {
        agent.activeSessions = Math.max(0, agent.activeSessions - 1);
      }
    }

    logger.chat('Session closed', {
      sessionId,
      customerId: session.customerId,
      closedBy,
      reason,
      duration: session.closedAt - session.createdAt,
      messageCount: (this.messageHistory.get(sessionId) || []).length
    });

    // Send system message
    this.sendMessage(sessionId, 'system', 'system', 
      `Chat session ended. ${reason}`
    );

    this.emit('sessionClosed', { sessionId, session, closedBy, reason });

    // Archive session after 24 hours
    setTimeout(() => {
      this.archiveSession(sessionId);
    }, 24 * 60 * 60 * 1000);

    return session;
  }

  // Archive old session
  archiveSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    const messages = this.messageHistory.get(sessionId);

    if (session && messages) {
      // In production, this would save to database
      logger.chat('Session archived', {
        sessionId,
        customerId: session.customerId,
        messageCount: messages.length,
        duration: (session.closedAt || new Date()) - session.createdAt
      });
    }

    this.activeSessions.delete(sessionId);
    this.messageHistory.delete(sessionId);
  }

  // Handle system messages
  handleSystemMessage(sessionId, message) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Auto-responses based on content
    if (message.content.includes('joined the conversation')) {
      // Agent joined - no additional action needed
      return;
    }

    if (message.content.includes('Chat session ended')) {
      // Session ended - clean up
      return;
    }
  }

  // Clean up inactive sessions
  cleanupInactiveSessions() {
    const now = new Date();
    const inactiveThreshold = 60 * 60 * 1000; // 1 hour
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions) {
      const inactiveTime = now - session.lastActivity;
      
      if (inactiveTime > inactiveThreshold && session.status !== 'closed') {
        this.closeSession(sessionId, 'system', 'Session closed due to inactivity');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.chat('Inactive sessions cleaned up', {
        cleanedCount,
        totalSessions: this.activeSessions.size
      });
    }
  }

  // Log service metrics
  logMetrics() {
    const metrics = {
      activeSessions: this.activeSessions.size,
      queuedSessions: this.sessionQueue.length,
      totalAgents: this.supportAgents.size,
      availableAgents: Array.from(this.supportAgents.values())
        .filter(agent => agent.status === 'available').length,
      busyAgents: Array.from(this.supportAgents.values())
        .filter(agent => agent.status === 'busy').length
    };

    logger.chat('Service metrics', {
      ...metrics,
      type: 'metrics'
    });

    return metrics;
  }

  // Get service statistics
  getStatistics() {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    
    let todaySessions = 0;
    let totalMessages = 0;
    let averageResponseTime = 0;

    for (const [sessionId, session] of this.activeSessions) {
      if (session.createdAt >= dayAgo) {
        todaySessions++;
      }
      
      const messages = this.messageHistory.get(sessionId) || [];
      totalMessages += messages.length;
    }

    return {
      activeSessions: this.activeSessions.size,
      queuedSessions: this.sessionQueue.length,
      todaySessions,
      totalMessages,
      agents: {
        total: this.supportAgents.size,
        available: Array.from(this.supportAgents.values())
          .filter(agent => agent.status === 'available').length,
        busy: Array.from(this.supportAgents.values())
          .filter(agent => agent.status === 'busy').length,
        offline: Array.from(this.supportAgents.values())
          .filter(agent => agent.status === 'offline').length
      },
      averageWaitTime: this.calculateAverageWaitTime(),
      averageSessionDuration: this.calculateAverageSessionDuration()
    };
  }

  // Calculate average wait time
  calculateAverageWaitTime() {
    if (this.sessionQueue.length === 0) return 0;
    
    const now = new Date();
    let totalWaitTime = 0;
    
    for (const sessionId of this.sessionQueue) {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        totalWaitTime += now - session.createdAt;
      }
    }
    
    return Math.round(totalWaitTime / this.sessionQueue.length / 1000); // seconds
  }

  // Calculate average session duration
  calculateAverageSessionDuration() {
    const closedSessions = Array.from(this.activeSessions.values())
      .filter(session => session.status === 'closed' && session.closedAt);
    
    if (closedSessions.length === 0) return 0;
    
    const totalDuration = closedSessions.reduce((sum, session) => {
      return sum + (session.closedAt - session.createdAt);
    }, 0);
    
    return Math.round(totalDuration / closedSessions.length / 1000); // seconds
  }

  // Search chat history
  searchMessages(query, filters = {}) {
    const results = [];
    const searchRegex = new RegExp(query, 'i');
    
    for (const [sessionId, messages] of this.messageHistory) {
      const session = this.activeSessions.get(sessionId);
      if (!session) continue;
      
      // Apply filters
      if (filters.customerId && session.customerId !== filters.customerId) continue;
      if (filters.agentId && session.assignedAgent !== filters.agentId) continue;
      if (filters.dateFrom && session.createdAt < new Date(filters.dateFrom)) continue;
      if (filters.dateTo && session.createdAt > new Date(filters.dateTo)) continue;
      
      // Search messages
      const matchingMessages = messages.filter(message => 
        searchRegex.test(message.content)
      );
      
      if (matchingMessages.length > 0) {
        results.push({
          sessionId,
          session,
          messages: matchingMessages
        });
      }
    }
    
    return results;
  }
}

// Create singleton instance
const chatService = new ChatService();

export default chatService;
export { ChatService };