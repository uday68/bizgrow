import React, { useState, useEffect, useRef } from 'react';
import { websocketService } from '../services/websocketService';

interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

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
}

interface ChatInterfaceProps {
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  onSessionCreated?: (session: ChatSession) => void;
  onMessageReceived?: (message: Message) => void;
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  customerId,
  customerName = 'Anonymous',
  customerEmail,
  onSessionCreated,
  onMessageReceived,
  className = ''
}) => {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize chat session
  useEffect(() => {
    initializeChat();
    return () => {
      if (session) {
        websocketService.send({
          type: 'leaveSession',
          sessionId: session.id
        });
      }
      websocketService.disconnect();
    };
  }, []);

  const initializeChat = async () => {
    try {
      setConnectionStatus('connecting');
      setError(null);

      // Create chat session
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerInfo: {
            customerId,
            name: customerName,
            email: customerEmail
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create chat session');
      }

      const { data: newSession } = await response.json();
      setSession(newSession);
      setMessages(newSession.messages || []);
      
      if (onSessionCreated) {
        onSessionCreated(newSession);
      }

      // Connect to WebSocket
      await connectWebSocket(newSession.id);

    } catch (error) {
      console.error('Failed to initialize chat:', error);
      setError('Failed to start chat session. Please try again.');
      setConnectionStatus('disconnected');
    }
  };

  const connectWebSocket = async (sessionId: string) => {
    try {
      // Connect WebSocket
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
      setConnectionStatus('connected');

      // Join chat session
      websocketService.send({
        type: 'joinSession',
        sessionId
      });

      // Setup event listeners
      setupWebSocketListeners();

    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setError('Connection failed. Some features may not work properly.');
      setConnectionStatus('disconnected');
    }
  };

  const setupWebSocketListeners = () => {
    // Message received
    websocketService.on('messageReceived', (data) => {
      const { message } = data;
      const formattedMessage = {
        ...message,
        timestamp: new Date(message.timestamp)
      };
      
      setMessages(prev => [...prev, formattedMessage]);
      
      if (onMessageReceived) {
        onMessageReceived(formattedMessage);
      }
    });

    // Agent assigned
    websocketService.on('agentAssigned', (data) => {
      const { session: updatedSession } = data;
      setSession(updatedSession);
      
      // Add system message
      const systemMessage: Message = {
        id: `system_${Date.now()}`,
        sessionId: updatedSession.id,
        senderId: 'system',
        senderType: 'system',
        content: 'A support agent has joined the conversation and will assist you.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, systemMessage]);
    });

    // Session closed
    websocketService.on('sessionClosed', (data) => {
      const { session: updatedSession, reason } = data;
      setSession(updatedSession);
      
      // Add system message
      const systemMessage: Message = {
        id: `system_${Date.now()}`,
        sessionId: updatedSession.id,
        senderId: 'system',
        senderType: 'system',
        content: `Chat session ended. ${reason}`,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, systemMessage]);
    });

    // Typing indicators
    websocketService.on('userTyping', (data) => {
      const { userId, senderType, isTyping } = data;
      if (senderType === 'agent') {
        setAgentTyping(isTyping);
      }
    });

    // User joined/left
    websocketService.on('userJoined', (data) => {
      if (data.userRole === 'developer' || data.userRole === 'admin') {
        const systemMessage: Message = {
          id: `system_${Date.now()}`,
          sessionId: session?.id || '',
          senderId: 'system',
          senderType: 'system',
          content: 'A support agent is now available to help you.',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, systemMessage]);
      }
    });

    // Error handling
    websocketService.on('error', (data) => {
      console.error('WebSocket error:', data);
      setError(data.message || 'An error occurred');
    });
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !session) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setError(null);

    try {
      // Send via WebSocket if connected, otherwise use HTTP API
      if (isConnected) {
        websocketService.send({
          type: 'sendMessage',
          sessionId: session.id,
          content: messageContent,
          metadata: {
            timestamp: new Date().toISOString()
          }
        });
      } else {
        // Fallback to HTTP API
        const response = await fetch(`/api/chat/sessions/${session.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: messageContent,
            senderType: 'customer',
            senderId: customerId || 'anonymous'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const { data: message } = await response.json();
        const formattedMessage = {
          ...message,
          timestamp: new Date(message.timestamp)
        };
        
        setMessages(prev => [...prev, formattedMessage]);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      setError('Failed to send message. Please try again.');
      
      // Re-add message to input
      setNewMessage(messageContent);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = () => {
    if (!session || !isConnected) return;

    setIsTyping(true);
    
    // Send typing indicator
    websocketService.send({
      type: 'typing',
      sessionId: session.id,
      isTyping: true
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      websocketService.send({
        type: 'typing',
        sessionId: session.id,
        isTyping: false
      });
    }, 2000);
  };

  const closeChat = async () => {
    if (!session) return;

    try {
      await fetch(`/api/chat/sessions/${session.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Session ended by customer'
        })
      });

      // Leave WebSocket room
      if (isConnected) {
        websocketService.send({
          type: 'leaveSession',
          sessionId: session.id
        });
      }

    } catch (error) {
      console.error('Failed to close chat:', error);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageSenderName = (message: Message) => {
    switch (message.senderType) {
      case 'customer':
        return customerName;
      case 'agent':
        return 'Support Agent';
      case 'system':
        return 'System';
      default:
        return 'Unknown';
    }
  };

  if (!session) {
    return (
      <div className={`chat-interface loading ${className}`}>
        <div className="chat-header">
          <h3>Customer Support</h3>
          <div className="connection-status connecting">
            <span className="status-dot"></span>
            Connecting...
          </div>
        </div>
        <div className="chat-body">
          <div className="loading-message">
            Starting chat session...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-interface ${className}`}>
      <div className="chat-header">
        <h3>Customer Support</h3>
        <div className={`connection-status ${connectionStatus}`}>
          <span className="status-dot"></span>
          {connectionStatus === 'connected' ? 'Connected' : 
           connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>
        <button 
          className="close-chat-btn"
          onClick={closeChat}
          title="End chat session"
        >
          ×
        </button>
      </div>

      <div className="chat-body">
        <div className="messages-container">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`message ${message.senderType}`}
            >
              <div className="message-header">
                <span className="sender-name">
                  {getMessageSenderName(message)}
                </span>
                <span className="message-time">
                  {formatTime(message.timestamp)}
                </span>
              </div>
              <div className="message-content">
                {message.content}
              </div>
            </div>
          ))}
          
          {agentTyping && (
            <div className="message agent typing-indicator">
              <div className="message-header">
                <span className="sender-name">Support Agent</span>
              </div>
              <div className="message-content">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="typing-text">is typing...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
            <button 
              className="error-dismiss"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}

        <div className="chat-status">
          {session.status === 'waiting' && (
            <div className="status-message waiting">
              <span className="status-icon">⏳</span>
              Waiting for an available agent...
            </div>
          )}
          {session.status === 'active' && session.assignedAgent && (
            <div className="status-message active">
              <span className="status-icon">✅</span>
              Connected with support agent
            </div>
          )}
          {session.status === 'closed' && (
            <div className="status-message closed">
              <span className="status-icon">🔒</span>
              Chat session has ended
            </div>
          )}
        </div>
      </div>

      <div className="chat-input">
        <div className="input-container">
          <textarea
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyPress={handleKeyPress}
            placeholder={
              session.status === 'closed' 
                ? 'Chat session has ended' 
                : 'Type your message...'
            }
            disabled={session.status === 'closed'}
            rows={1}
            className="message-input"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || session.status === 'closed'}
            className="send-button"
            title="Send message"
          >
            <span className="send-icon">➤</span>
          </button>
        </div>
        
        {isTyping && (
          <div className="typing-indicator-self">
            You are typing...
          </div>
        )}
      </div>

      <style jsx>{`
        .chat-interface {
          display: flex;
          flex-direction: column;
          height: 500px;
          max-width: 400px;
          border: 1px solid #e1e5e9;
          border-radius: 12px;
          background: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid #e1e5e9;
          background: #f8f9fa;
          border-radius: 12px 12px 0 0;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #dc3545;
        }

        .connection-status.connected .status-dot {
          background: #28a745;
        }

        .connection-status.connecting .status-dot {
          background: #ffc107;
          animation: pulse 1.5s infinite;
        }

        .close-chat-btn {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #6c757d;
          padding: 4px;
          border-radius: 4px;
        }

        .close-chat-btn:hover {
          background: #e9ecef;
          color: #495057;
        }

        .chat-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 80%;
        }

        .message.customer {
          align-self: flex-end;
        }

        .message.agent,
        .message.system {
          align-self: flex-start;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
          font-size: 11px;
          color: #6c757d;
        }

        .sender-name {
          font-weight: 600;
        }

        .message-time {
          font-size: 10px;
        }

        .message-content {
          padding: 8px 12px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .message.customer .message-content {
          background: #007bff;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.agent .message-content {
          background: #f8f9fa;
          color: #1a1a1a;
          border: 1px solid #e1e5e9;
          border-bottom-left-radius: 4px;
        }

        .message.system .message-content {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
          font-style: italic;
          text-align: center;
        }

        .typing-indicator {
          opacity: 0.7;
        }

        .typing-dots {
          display: inline-flex;
          gap: 2px;
          margin-right: 6px;
        }

        .typing-dots span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #6c757d;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        .typing-text {
          font-size: 12px;
          color: #6c757d;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #f8d7da;
          color: #721c24;
          border-top: 1px solid #f5c6cb;
          font-size: 13px;
        }

        .error-dismiss {
          background: none;
          border: none;
          color: #721c24;
          cursor: pointer;
          font-size: 16px;
          margin-left: auto;
        }

        .chat-status {
          padding: 8px 16px;
          border-top: 1px solid #e1e5e9;
        }

        .status-message {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-message.waiting {
          color: #856404;
        }

        .status-message.active {
          color: #155724;
        }

        .status-message.closed {
          color: #721c24;
        }

        .chat-input {
          border-top: 1px solid #e1e5e9;
          padding: 16px;
        }

        .input-container {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        .message-input {
          flex: 1;
          border: 1px solid #e1e5e9;
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 14px;
          resize: none;
          outline: none;
          font-family: inherit;
          max-height: 100px;
        }

        .message-input:focus {
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .message-input:disabled {
          background: #f8f9fa;
          color: #6c757d;
        }

        .send-button {
          background: #007bff;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 14px;
        }

        .send-button:hover:not(:disabled) {
          background: #0056b3;
        }

        .send-button:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .typing-indicator-self {
          font-size: 11px;
          color: #6c757d;
          margin-top: 4px;
          font-style: italic;
        }

        .loading-message {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #6c757d;
          font-style: italic;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes typing {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        /* Scrollbar styling */
        .messages-container::-webkit-scrollbar {
          width: 4px;
        }

        .messages-container::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .messages-container::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 2px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;