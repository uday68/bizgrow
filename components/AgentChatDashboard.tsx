import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Users, Bell, X, Clock } from 'lucide-react';
import { websocketService } from '../services/websocketService';
import { apiService } from '../services/apiService';

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
  messages: Message[];
  unreadCount: number;
}

interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

interface Notification {
  id: string;
  type: 'new_session' | 'new_message' | 'session_closed';
  sessionId: string;
  customerName: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export const AgentChatDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState<{ [sessionId: string]: boolean }>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeDashboard();
    return () => {
      websocketService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSessionId, sessions]);

  const initializeDashboard = async () => {
    try {
      // Connect to WebSocket
      websocketService.connect();
      
      // Wait for connection
      await new Promise((resolve) => {
        websocketService.on('connected', () => {
          resolve(true);
        });
      });

      // Join as agent
      websocketService.send({
        type: 'joinAsAgent',
        agentId: apiService.getUser()?.id || 'agent_' + Date.now()
      });

      // Setup listeners
      setupWebSocketListeners();

      // Fetch active sessions
      await fetchActiveSessions();
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
    }
  };

  const setupWebSocketListeners = () => {
    // New session created
    websocketService.on('newSession', (data) => {
      const { session } = data;
      setSessions(prev => [session, ...prev]);
      
      addNotification({
        type: 'new_session',
        sessionId: session.id,
        customerName: session.customerInfo.name,
        message: `${session.customerInfo.name} started a new chat`,
      });
      
      playNotificationSound();
    });

    // Message received
    websocketService.on('messageReceived', (data) => {
      const { message } = data;
      
      setSessions(prev => prev.map(session => {
        if (session.id === message.sessionId) {
          const isActive = activeSessionId === session.id;
          return {
            ...session,
            messages: [...session.messages, message],
            lastActivity: new Date(message.timestamp),
            unreadCount: isActive ? 0 : session.unreadCount + 1
          };
        }
        return session;
      }));

      // Add notification if not active session
      if (activeSessionId !== message.sessionId && message.senderType === 'customer') {
        const session = sessions.find(s => s.id === message.sessionId);
        if (session) {
          addNotification({
            type: 'new_message',
            sessionId: message.sessionId,
            customerName: session.customerInfo.name,
            message: message.content.substring(0, 50) + '...',
          });
          playNotificationSound();
        }
      }
    });

    // Customer typing
    websocketService.on('userTyping', (data) => {
      const { sessionId, isTyping: typing } = data;
      setIsTyping(prev => ({ ...prev, [sessionId]: typing }));
    });

    // Session closed
    websocketService.on('sessionClosed', (data) => {
      const { session } = data;
      setSessions(prev => prev.map(s => 
        s.id === session.id ? { ...s, status: 'closed' } : s
      ));
    });
  };

  const fetchActiveSessions = async () => {
    try {
      const response = await apiService.getActiveChatSessions({ 
        status: 'waiting,active',
        limit: 50 
      });
      
      if (response.success) {
        setSessions(response.data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const notification: Notification = {
      ...notif,
      id: `notif_${Date.now()}`,
      timestamp: new Date(),
      read: false
    };
    
    setNotifications(prev => [notification, ...prev].slice(0, 20));
  };

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const handleSessionClick = (sessionId: string) => {
    setActiveSessionId(sessionId);
    
    // Mark session as read
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, unreadCount: 0 } : s
    ));

    // Join session
    websocketService.send({
      type: 'joinSession',
      sessionId
    });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeSessionId) return;

    const content = newMessage.trim();
    setNewMessage('');

    try {
      websocketService.send({
        type: 'sendMessage',
        sessionId: activeSessionId,
        content,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const unreadNotifications = notifications.filter(n => !n.read).length;
  const waitingSessions = sessions.filter(s => s.status === 'waiting').length;
  const activeSessions = sessions.filter(s => s.status === 'active').length;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Notification Sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXvzn0pBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuIwUug8zx2Ik2CBhku+zooVARC0yl4fG5ZRwFNo3V7859KQUofsz" />
      
      {/* Main Dashboard - Always visible, not minimizable when used as a page */}
      <div className="fixed inset-0 bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-7xl h-[calc(100vh-2rem)] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare size={24} />
              <div>
                <h2 className="font-bold text-lg">Agent Chat Dashboard</h2>
                <p className="text-xs text-indigo-100">
                  {waitingSessions} waiting • {activeSessions} active
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <Bell size={20} />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sessions List */}
            <div className="w-80 border-r border-slate-200 flex flex-col">
              <div className="p-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Users size={16} />
                  <span>Active Chats ({sessions.length})</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <MessageSquare className="mx-auto mb-2 text-slate-300" size={48} />
                    <p className="text-sm">No active chats</p>
                  </div>
                ) : (
                  sessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => handleSessionClick(session.id)}
                      className={`w-full p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left ${
                        activeSessionId === session.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            session.status === 'waiting' ? 'bg-yellow-500 animate-pulse' :
                            session.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                          }`} />
                          <span className="font-semibold text-slate-900">
                            {session.customerInfo.name}
                          </span>
                        </div>
                        {session.unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {session.unreadCount}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-slate-600 truncate">
                        {session.messages[session.messages.length - 1]?.content || 'No messages yet'}
                      </p>
                      
                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                        <Clock size={12} />
                        <span>{new Date(session.lastActivity).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
              {activeSession ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {activeSession.customerInfo.name}
                        </h3>
                        <p className="text-xs text-slate-600">
                          {activeSession.customerInfo.email || 'No email provided'}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        activeSession.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' :
                        activeSession.status === 'active' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {activeSession.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                    {activeSession.messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderType === 'customer' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div className={`max-w-[70%] ${
                          message.senderType === 'customer'
                            ? 'bg-white border border-slate-200'
                            : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
                        } rounded-2xl p-3 shadow-sm`}>
                          <p className="text-sm">{message.content}</p>
                          <p className={`text-xs mt-1 ${
                            message.senderType === 'customer' ? 'text-slate-500' : 'text-indigo-100'
                          }`}>
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {isTyping[activeSessionId] && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-slate-200 bg-white">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type your message..."
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <MessageSquare className="mx-auto mb-4 text-slate-300" size={64} />
                    <p className="text-lg font-semibold">Select a chat to start</p>
                    <p className="text-sm mt-2">Choose a customer from the list</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="absolute top-16 right-0 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-96 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="font-semibold text-slate-900">Notifications</h3>
            <button
              onClick={() => setShowNotifications(false)}
              className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Bell className="mx-auto mb-2 text-slate-300" size={48} />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => {
                    handleSessionClick(notif.sessionId);
                    setNotifications(prev => prev.map(n => 
                      n.id === notif.id ? { ...n, read: true } : n
                    ));
                  }}
                  className={`p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${
                    !notif.read ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      notif.type === 'new_session' ? 'bg-green-100 text-green-600' :
                      notif.type === 'new_message' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {notif.type === 'new_session' ? <Users size={16} /> : <MessageSquare size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900">{notif.customerName}</p>
                      <p className="text-xs text-slate-600 truncate">{notif.message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(notif.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentChatDashboard;
