import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import chatService from './chatService.js';
import logger from './logger.js';
import { websocketLogger } from '../middleware/chatLogging.js';

class WebSocketServer {
  constructor() {
    this.io = null;
    this.connections = new Map(); // connectionId -> connection data
    this.userConnections = new Map(); // userId -> Set of connectionIds
    this.sessionConnections = new Map(); // sessionId -> Set of connectionIds
    
    this.initialize();
  }

  initialize() {
    // Listen for chat service events
    chatService.on('sessionCreated', (session) => {
      this.broadcastToSession(session.id, 'sessionCreated', session);
    });

    chatService.on('messageReceived', ({ sessionId, message, session }) => {
      this.broadcastToSession(sessionId, 'messageReceived', { message, session });
    });

    chatService.on('agentAssigned', ({ sessionId, agentId, session }) => {
      this.broadcastToSession(sessionId, 'agentAssigned', { agentId, session });
      this.notifyAgent(agentId, 'sessionAssigned', { sessionId, session });
    });

    chatService.on('sessionClosed', ({ sessionId, session, closedBy, reason }) => {
      this.broadcastToSession(sessionId, 'sessionClosed', { session, closedBy, reason });
    });

    chatService.on('agentStatusChanged', ({ agentId, status, agent }) => {
      this.notifyAgent(agentId, 'statusChanged', { status, agent });
      this.broadcastToAdmins('agentStatusChanged', { agentId, status, agent });
    });

    logger.websocket('WebSocket server initialized', {
      operation: 'initialization'
    });
  }

  // Setup Socket.IO server
  setup(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? [
              'https://bizgrow-ai.vercel.app',
              'https://bizgrow-ai.netlify.app',
              'https://biggrow-production.up.railway.app'
            ]
          : ['http://localhost:3000', 'http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
          // Verify JWT token for authenticated users
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.userId = decoded.id;
          socket.userRole = decoded.role;
          socket.isAuthenticated = true;
        } else {
          // Allow anonymous connections for customer chat
          socket.userId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          socket.userRole = 'guest';
          socket.isAuthenticated = false;
        }

        // Add logging middleware
        websocketLogger()(socket, next);
        
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', {
          error: error.message,
          socketId: socket.id
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.websocket('WebSocket server setup completed', {
      operation: 'setup'
    });

    return this.io;
  }

  // Handle new WebSocket connection
  handleConnection(socket) {
    const connectionData = {
      id: socket.id,
      userId: socket.userId,
      userRole: socket.userRole,
      isAuthenticated: socket.isAuthenticated,
      connectedAt: new Date(),
      lastActivity: new Date(),
      rooms: new Set()
    };

    this.connections.set(socket.id, connectionData);

    // Track user connections
    if (!this.userConnections.has(socket.userId)) {
      this.userConnections.set(socket.userId, new Set());
    }
    this.userConnections.get(socket.userId).add(socket.id);

    socket.wsLogger?.connected({
      userId: socket.userId,
      userRole: socket.userRole,
      isAuthenticated: socket.isAuthenticated
    });

    // Emit user_connected event for notification delivery
    if (socket.isAuthenticated) {
      this.emit('user_connected', socket.userId);
    }

    // Handle chat events
    this.setupChatHandlers(socket);

    // Handle support agent events
    if (socket.userRole === 'developer' || socket.userRole === 'admin') {
      this.setupAgentHandlers(socket);
    }

    // Handle admin events
    if (socket.userRole === 'admin') {
      this.setupAdminHandlers(socket);
    }

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Send welcome message
    socket.emit('connected', {
      connectionId: socket.id,
      userId: socket.userId,
      serverTime: new Date().toISOString()
    });
  }

  // Setup chat event handlers
  setupChatHandlers(socket) {
    // Join chat session room
    socket.on('joinSession', async (data) => {
      try {
        const { sessionId } = data;
        const session = chatService.getSession(sessionId);
        
        if (!session) {
          socket.emit('error', { message: 'Chat session not found' });
          return;
        }

        // Join session room
        socket.join(`session_${sessionId}`);
        this.connections.get(socket.id).rooms.add(`session_${sessionId}`);

        // Track session connections
        if (!this.sessionConnections.has(sessionId)) {
          this.sessionConnections.set(sessionId, new Set());
        }
        this.sessionConnections.get(sessionId).add(socket.id);

        socket.wsLogger?.joinRoom(`session_${sessionId}`, { sessionId });

        // Send session data
        socket.emit('sessionJoined', { session });

        // Notify others in session
        socket.to(`session_${sessionId}`).emit('userJoined', {
          userId: socket.userId,
          userRole: socket.userRole
        });

      } catch (error) {
        logger.error('Failed to join chat session', {
          error: error.message,
          sessionId: data?.sessionId,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to join chat session' });
      }
    });

    // Leave chat session room
    socket.on('leaveSession', (data) => {
      try {
        const { sessionId } = data;
        socket.leave(`session_${sessionId}`);
        this.connections.get(socket.id).rooms.delete(`session_${sessionId}`);

        // Remove from session connections
        if (this.sessionConnections.has(sessionId)) {
          this.sessionConnections.get(sessionId).delete(socket.id);
          if (this.sessionConnections.get(sessionId).size === 0) {
            this.sessionConnections.delete(sessionId);
          }
        }

        socket.wsLogger?.leaveRoom(`session_${sessionId}`, { sessionId });

        // Notify others in session
        socket.to(`session_${sessionId}`).emit('userLeft', {
          userId: socket.userId,
          userRole: socket.userRole
        });

      } catch (error) {
        logger.error('Failed to leave chat session', {
          error: error.message,
          sessionId: data?.sessionId,
          userId: socket.userId
        });
      }
    });

    // Send chat message
    socket.on('sendMessage', async (data) => {
      try {
        const { sessionId, content, metadata = {} } = data;
        
        if (!content || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content is required' });
          return;
        }

        const enrichedMetadata = {
          ...metadata,
          connectionId: socket.id,
          userAgent: socket.handshake.headers['user-agent']
        };

        const message = await chatService.sendMessage(
          sessionId,
          socket.userId,
          socket.userRole === 'guest' ? 'customer' : 'agent',
          content.trim(),
          enrichedMetadata
        );

        socket.wsLogger?.messageSent('sendMessage', { sessionId, messageId: message.id });

        // Message will be broadcast via chat service event

      } catch (error) {
        logger.error('Failed to send chat message via WebSocket', {
          error: error.message,
          sessionId: data?.sessionId,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing', (data) => {
      const { sessionId, isTyping } = data;
      socket.to(`session_${sessionId}`).emit('userTyping', {
        userId: socket.userId,
        userRole: socket.userRole,
        isTyping
      });
    });
  }

  // Setup support agent event handlers
  setupAgentHandlers(socket) {
    // Register as support agent
    socket.on('registerAgent', async (data) => {
      try {
        const agentInfo = {
          name: data.name || socket.userId,
          email: data.email,
          maxSessions: data.maxSessions || 5,
          skills: data.skills || []
        };

        const agent = chatService.registerAgent(socket.userId, agentInfo);
        
        // Join agents room
        socket.join('agents');
        this.connections.get(socket.id).rooms.add('agents');

        socket.emit('agentRegistered', { agent });
        socket.wsLogger?.joinRoom('agents', { agentId: socket.userId });

      } catch (error) {
        logger.error('Failed to register agent via WebSocket', {
          error: error.message,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to register as agent' });
      }
    });

    // Update agent status
    socket.on('updateStatus', (data) => {
      try {
        const { status } = data;
        chatService.updateAgentStatus(socket.userId, status);
        
        socket.emit('statusUpdated', { status });

      } catch (error) {
        logger.error('Failed to update agent status via WebSocket', {
          error: error.message,
          userId: socket.userId,
          status: data?.status
        });
        socket.emit('error', { message: 'Failed to update status' });
      }
    });

    // Get agent queue
    socket.on('getQueue', () => {
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

        socket.emit('queueData', {
          queue: queueData,
          length: queueData.length
        });

      } catch (error) {
        logger.error('Failed to get queue via WebSocket', {
          error: error.message,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to get queue data' });
      }
    });

    // Assign session to agent
    socket.on('assignSession', async (data) => {
      try {
        const { sessionId } = data;
        const session = chatService.assignAgent(sessionId, socket.userId);
        
        socket.emit('sessionAssigned', { session });

      } catch (error) {
        logger.error('Failed to assign session via WebSocket', {
          error: error.message,
          sessionId: data?.sessionId,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to assign session' });
      }
    });
  }

  // Setup admin event handlers
  setupAdminHandlers(socket) {
    // Join admin room
    socket.join('admins');
    this.connections.get(socket.id).rooms.add('admins');

    // Get chat statistics
    socket.on('getStatistics', () => {
      try {
        const statistics = chatService.getStatistics();
        socket.emit('statisticsData', statistics);

      } catch (error) {
        logger.error('Failed to get statistics via WebSocket', {
          error: error.message,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to get statistics' });
      }
    });

    // Get all active sessions
    socket.on('getAllSessions', (data = {}) => {
      try {
        const { status, agentId, limit = 50 } = data;
        
        const allSessions = [];
        for (const [sessionId, session] of chatService.activeSessions) {
          if (status && session.status !== status) continue;
          if (agentId && session.assignedAgent !== agentId) continue;
          
          allSessions.push({
            ...session,
            messageCount: (chatService.messageHistory.get(sessionId) || []).length
          });
        }

        const sortedSessions = allSessions
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, parseInt(limit));

        socket.emit('allSessionsData', {
          sessions: sortedSessions,
          total: allSessions.length
        });

      } catch (error) {
        logger.error('Failed to get all sessions via WebSocket', {
          error: error.message,
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to get sessions data' });
      }
    });
  }

  // Handle connection disconnection
  handleDisconnection(socket, reason) {
    const connectionData = this.connections.get(socket.id);
    if (!connectionData) return;

    const duration = Date.now() - connectionData.connectedAt.getTime();

    socket.wsLogger?.disconnected(reason, duration);

    // Remove from user connections
    if (this.userConnections.has(socket.userId)) {
      this.userConnections.get(socket.userId).delete(socket.id);
      if (this.userConnections.get(socket.userId).size === 0) {
        this.userConnections.delete(socket.userId);
      }
    }

    // Remove from session connections
    for (const [sessionId, connections] of this.sessionConnections) {
      if (connections.has(socket.id)) {
        connections.delete(socket.id);
        if (connections.size === 0) {
          this.sessionConnections.delete(sessionId);
        }
        
        // Notify others in session
        socket.to(`session_${sessionId}`).emit('userLeft', {
          userId: socket.userId,
          userRole: socket.userRole
        });
      }
    }

    // Update agent status if they were online
    if ((socket.userRole === 'developer' || socket.userRole === 'admin') && 
        chatService.supportAgents.has(socket.userId)) {
      try {
        chatService.updateAgentStatus(socket.userId, 'offline');
      } catch (error) {
        // Agent might not be registered, ignore error
      }
    }

    this.connections.delete(socket.id);

    logger.websocket('WebSocket disconnected', {
      connectionId: socket.id,
      userId: socket.userId,
      reason,
      duration,
      operation: 'disconnection'
    });
  }

  // Broadcast message to all connections in a session
  broadcastToSession(sessionId, event, data) {
    if (this.io) {
      this.io.to(`session_${sessionId}`).emit(event, data);
      
      logger.websocket('Broadcast to session', {
        sessionId,
        event,
        connectionCount: this.sessionConnections.get(sessionId)?.size || 0,
        operation: 'broadcast'
      });
    }
  }

  // Send notification to specific agent
  notifyAgent(agentId, event, data) {
    const connections = this.userConnections.get(agentId);
    if (connections && this.io) {
      for (const connectionId of connections) {
        this.io.to(connectionId).emit(event, data);
      }
      
      logger.websocket('Notify agent', {
        agentId,
        event,
        connectionCount: connections.size,
        operation: 'notify'
      });
    }
  }

  // Broadcast to all admins
  broadcastToAdmins(event, data) {
    if (this.io) {
      this.io.to('admins').emit(event, data);
      
      logger.websocket('Broadcast to admins', {
        event,
        operation: 'broadcast'
      });
    }
  }

  // Get connection statistics
  getConnectionStats() {
    const stats = {
      totalConnections: this.connections.size,
      authenticatedConnections: 0,
      guestConnections: 0,
      agentConnections: 0,
      adminConnections: 0,
      activeSessions: this.sessionConnections.size,
      connectedUsers: this.userConnections.size
    };

    for (const connection of this.connections.values()) {
      if (connection.isAuthenticated) {
        stats.authenticatedConnections++;
      } else {
        stats.guestConnections++;
      }

      if (connection.userRole === 'developer') {
        stats.agentConnections++;
      } else if (connection.userRole === 'admin') {
        stats.adminConnections++;
      }
    }

    return stats;
  }

  // Cleanup inactive connections
  cleanupConnections() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    let cleanedCount = 0;

    for (const [connectionId, connection] of this.connections) {
      const inactiveTime = now - connection.lastActivity.getTime();
      
      if (inactiveTime > inactiveThreshold) {
        // Force disconnect inactive connection
        const socket = this.io?.sockets.sockets.get(connectionId);
        if (socket) {
          socket.disconnect(true);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.websocket('Inactive connections cleaned up', {
        cleanedCount,
        totalConnections: this.connections.size,
        operation: 'cleanup'
      });
    }
  }
}

// Create singleton instance
const websocketServer = new WebSocketServer();

// Cleanup inactive connections every 15 minutes
setInterval(() => {
  websocketServer.cleanupConnections();
}, 15 * 60 * 1000);

export default websocketServer;
export { WebSocketServer };