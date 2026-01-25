import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
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
          ? { ...s, lastActivity: new Date(session.lastActivity), messageCount: (s.messageCount || 0) + 1 }
          : s
      ));
    });

    // Session closed
    websocketService.on('sessionClosed', (data) => {
      const { sessionId } = data;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
        setSessionMessages([]);
      }
    });

    // Queue updated
    websocketService.on('queueUpdated', (data) => {
      setQueuedSessions(data.queue || []);
    });

    // Stats updated
    websocketService.on('statsUpdated', (data) => {
      setStats(data.stats);
    });
  };

  const registerAgent = async () => {
    websocketService.send({
      type: 'registerAgent',
      agentId: userId,
      agentName: userName,
      agentEmail: userEmail,
    });
  };

  const loadDashboardData = async () => {
    // Request initial dashboard data
    websocketService.send({
      type: 'getDashboardData',
      agentId: userId,
    });
  };

  const updateAgentStatus = (status: 'available' | 'busy' | 'offline') => {
    websocketService.send({
      type: 'updateStatus',
      agentId: userId,
      status,
    });
    setAgentStatus(status);
  };

  const acceptSession = (sessionId: string) => {
    websocketService.send({
      type: 'acceptSession',
      agentId: userId,
      sessionId,
    });
  };

  const closeSession = (sessionId: string) => {
    websocketService.send({
      type: 'closeSession',
      agentId: userId,
      sessionId,
    });
  };

  const sendMessage = () => {
    if (!selectedSession || !newMessage.trim()) return;

    websocketService.send({
      type: 'sendMessage',
      sessionId: selectedSession.id,
      agentId: userId,
      content: newMessage,
    });

    setNewMessage('');
  };

  const selectSession = (session: ChatSession) => {
    setSelectedSession(session);
    // Load messages for this session
    websocketService.send({
      type: 'getSessionMessages',
      sessionId: session.id,
    });
  };

  return (
    <div className={`min-h-screen bg-slate-50 ${className}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Support Agent Dashboard</h1>
            <p className="text-sm text-slate-500">Manage customer support sessions</p>
          </div>
          
          {/* Agent Status Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Status:</span>
              <select
                value={agentStatus}
                onChange={(e) => updateAgentStatus(e.target.value as any)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${
                  agentStatus === 'available' ? 'bg-green-50 text-green-700 border-green-200' :
                  agentStatus === 'busy' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 m-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-red-500" size={20} />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.activeSessions}</p>
              <p className="text-xs text-slate-500">Active Sessions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.queuedSessions}</p>
              <p className="text-xs text-slate-500">In Queue</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.totalAgents}</p>
              <p className="text-xs text-slate-500">Total Agents</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{stats.availableAgents}</p>
              <p className="text-xs text-slate-500">Available</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.busyAgents}</p>
              <p className="text-xs text-slate-500">Busy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.averageWaitTime}s</p>
              <p className="text-xs text-slate-500">Avg Wait</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.averageSessionDuration}s</p>
              <p className="text-xs text-slate-500">Avg Duration</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex h-[calc(100vh-200px)]">
        {/* Sessions List */}
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto">
          {/* Queue Section */}
          {queuedSessions.length > 0 && (
            <div className="border-b border-slate-200">
              <div className="px-4 py-3 bg-yellow-50">
                <h3 className="font-semibold text-sm text-yellow-900">Waiting Queue ({queuedSessions.length})</h3>
              </div>
              {queuedSessions.map(session => (
                <div
                  key={session.id}
                  className="p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => acceptSession(session.id)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{session.customerInfo.name}</p>
                      <p className="text-xs text-slate-500">{session.customerInfo.email}</p>
                    </div>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded">
                      WAITING
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(session.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Active Sessions */}
          <div className="px-4 py-3 bg-slate-50">
            <h3 className="font-semibold text-sm text-slate-900">My Sessions ({sessions.length})</h3>
          </div>
          {sessions.map(session => (
            <div
              key={session.id}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${
                selectedSession?.id === session.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => selectSession(session)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{session.customerInfo.name}</p>
                  <p className="text-xs text-slate-500">{session.customerInfo.email}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-bold rounded ${
                  session.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {session.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">
                  {new Date(session.lastActivity).toLocaleTimeString()}
                </p>
                {session.messageCount && session.messageCount > 0 && (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                    {session.messageCount}
                  </span>
                )}
              </div>
            </div>
          ))}
          {sessions.length === 0 && queuedSessions.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              <p className="text-sm">No active sessions</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedSession ? (
            <>
              {/* Chat Header */}
              <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-lg text-slate-900">{selectedSession.customerInfo.name}</h2>
                    <p className="text-sm text-slate-500">{selectedSession.customerInfo.email}</p>
                  </div>
                  <button
                    onClick={() => closeSession(selectedSession.id)}
                    className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Close Session
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {sessionMessages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-lg ${
                        message.senderType === 'agent'
                          ? 'bg-indigo-600 text-white'
                          : message.senderType === 'system'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-white border border-slate-200 text-slate-900'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.senderType === 'agent' ? 'text-indigo-200' : 'text-slate-400'
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message Input */}
              <div className="bg-white border-t border-slate-200 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-lg font-medium">No session selected</p>
                <p className="text-sm">Select a session from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

};

export default SupportAgentDashboard;
