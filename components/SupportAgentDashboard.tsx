import React, { useState, useEffect } from 'react';
import { websocketService } from '../services/websocketService';

interface ChatSession {
  id: string;
  customerId: string;
  customerInfo: {
    name: string;
    email?: string;
  };
  status: 'waiting' | 'active' | 'closed';
  assignedAgent?: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount?: number;
}

interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

interface AgentStats {
  activeSessions: number;
  queuedSessions: number;
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  averageWaitTime: number;
  averageSessionDuration: number;
}

interface SupportAgentDashboardProps {
  userId: string;
  userName: string;
  userEmail: string;
  onSessionAssigned?: (session: ChatSession) => void;
  className?: string;
}

export const SupportAgentDashboard: React.FC<SupportAgentDashboardProps> = ({
  userId,
  userName,
  userEmail,
  onSessionAssigned,
  className = ''
}) => {
  const [isRegistered, setIsRegistered] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'available' | 'busy' | 'offline'>('offline');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [queuedSessions, setQueuedSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeAgent();
    return () => {
      websocketService.disconnect();
    };
  }, []);

  const initializeAgent = async () => {
    try {
      // Connect to WebSocket with authentication
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      websocketService.connect();
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        
        websocketService.on('connected', () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });

      setIsConnected(true);
      setupWebSocketListeners();
      
      // Register as support agent
      await registerAgent();
      
      // Load initial data
      await loadDashboardData();

    } catch (error) {
      console.error('Failed to initialize agent dashboard:', error);
      setError('Failed to connect to support system');
    }
  };

  const setupWebSocketListeners = () => {
    // Agent registered
    websocketService.on('agentRegistered', (data) => {
      setIsRegistered(true);
      setAgentStatus('available');
    });

    // Status updated
    websocketService.on('statusUpdated', (data) => {
      setAgentStatus(data.status);
    });

    // Session assigned
    websocketService.on('sessionAssigned', (data) => {
      const { session } = data;
      setSessions(prev => [...prev, session]);
      
      if (onSessionAssigned) {
        onSessionAssigned(session);
      }
    });

    // Message received
    websocketService.on('messageReceived', (data) => {
      const { message, session } = data;
      
      // Update session messages if it's the selected session
      if (selectedSession && message.sessionId === selectedSession.id) {
        setSessionMessages(prev => [...prev, {
          ...message,
          timestamp: new Date(message.timestamp)
        }]);
      }
      
      // Update session last activity
      setSessions(prev => prev.map(s => 
        s.id === session.id 
          ? { ...s, lastActivity: new Date(session.l