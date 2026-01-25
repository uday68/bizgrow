import React, { useState, useEffect, useRef } from 'react';
import { websocketService } from '../services/websocketService';
import { apiService } from '../services/apiService';

interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'customer' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    aiGenerated?: boolean;
    suggestedActions?: SuggestedAction[];
    quotation?: Quotation;
    [key: string]: any;
  };
}

interface SuggestedAction {
  type: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  serviceType?: string;
}

interface Quotation {
  id: string;
  businessId: string;
  customerId: string;
  services: QuotationService[];
  pricing: {
    subtotal: number;
    discounts: QuotationDiscount[];
    total: number;
  };
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';
  validUntil: Date;
  createdAt: Date;
}

interface QuotationService {
  type: string;
  name: string;
  description: string;
  basePrice: number;
  timeline: string;
}

interface QuotationDiscount {
  type: string;
  description: string;
  amount: number;
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
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [serviceCatalog, setServiceCatalog] = useState<QuotationService[]>([]);
  
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
    loadServiceCatalog();
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

      // Create chat session using apiService
      const response = await apiService.createChatSession({
        customerId,
        name: customerName,
        email: customerEmail
      });

      if (!response.success) {
        throw new Error('Failed to create chat session');
      }

      const newSession = response.data;
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
        // Fallback to HTTP API using apiService
        const response = await apiService.sendChatMessage(
          session.id,
          messageContent,
          customerId || 'anonymous'
        );

        if (!response.success) {
          throw new Error('Failed to send message');
        }

        const message = response.data;
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
      await apiService.closeChatSession(session.id, 'Session ended by customer');

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

  const loadServiceCatalog = async () => {
    try {
      const response = await apiService.getServiceCatalog();
      if (response.success) {
        setServiceCatalog(response.data.services);
      }
    } catch (error) {
      console.error('Failed to load service catalog:', error);
    }
  };

  const requestQuotation = async (services: string[]) => {
    if (!session) return;

    try {
      const response = await apiService.generateQuotation({
        businessId: session.customerId,
        customerId: customerId || 'anonymous',
        services,
        customerPreferences: {}
      });

      if (!response.success) {
        throw new Error('Failed to generate quotation');
      }

      const data = response.data;
      setSelectedQuotation(data.quotation);
      setShowQuotationModal(true);

      // Add quotation message to chat
      const quotationMessage: Message = {
        id: `quotation_${Date.now()}`,
        sessionId: session.id,
        senderId: 'mediator_ai',
        senderType: 'agent',
        content: data.message,
        timestamp: new Date(),
        metadata: {
          quotation: data.quotation,
          aiGenerated: true
        }
      };
      
      setMessages(prev => [...prev, quotationMessage]);

    } catch (error) {
      console.error('Failed to request quotation:', error);
      setError('Failed to generate quotation. Please try again.');
    }
  };

  const acceptQuotation = async (quotationId: string) => {
    try {
      const response = await apiService.acceptQuotation(
        quotationId,
        customerId || 'anonymous',
        'I accept this quotation'
      );

      if (!response.success) {
        throw new Error('Failed to accept quotation');
      }

      const data = response.data;
      
      // Add system message
      const systemMessage: Message = {
        id: `system_${Date.now()}`,
        sessionId: session?.id || '',
        senderId: 'system',
        senderType: 'system',
        content: `✅ Quotation accepted! ${data.nextSteps}`,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, systemMessage]);
      setShowQuotationModal(false);
      setSelectedQuotation(null);

    } catch (error) {
      console.error('Failed to accept quotation:', error);
      setError('Failed to accept quotation. Please try again.');
    }
  };

  const rejectQuotation = async (quotationId: string, reason: string = '') => {
    try {
      const response = await apiService.rejectQuotation(
        quotationId,
        customerId || 'anonymous',
        reason
      );

      if (!response.success) {
        throw new Error('Failed to reject quotation');
      }

      const data = response.data;
      
      // Add system message
      const systemMessage: Message = {
        id: `system_${Date.now()}`,
        sessionId: session?.id || '',
        senderId: 'system',
        senderType: 'system',
        content: data.message,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, systemMessage]);
      setShowQuotationModal(false);
      setSelectedQuotation(null);

    } catch (error) {
      console.error('Failed to reject quotation:', error);
      setError('Failed to reject quotation. Please try again.');
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
                
                {/* Display quotation if present */}
                {message.metadata?.quotation && (
                  <div className="quotation-preview">
                    <div className="quotation-header">
                      <span className="quotation-icon">💼</span>
                      <strong>Quotation Generated</strong>
                    </div>
                    <div className="quotation-summary">
                      <div className="quotation-services">
                        {message.metadata.quotation.services.length} service(s)
                      </div>
                      <div className="quotation-total">
                        Total: ${message.metadata.quotation.pricing.total.toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedQuotation(message.metadata.quotation);
                        setShowQuotationModal(true);
                      }}
                      className="view-quotation-btn"
                    >
                      View Details
                    </button>
                  </div>
                )}
                
                {/* Display suggested actions */}
                {message.metadata?.suggestedActions && message.metadata.suggestedActions.length > 0 && (
                  <div className="suggested-actions">
                    {message.metadata.suggestedActions.map((action: SuggestedAction, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (action.type === 'generate_quotation') {
                            // Show service selection for quotation
                            const defaultServices = ['website', 'digital-marketing'];
                            requestQuotation(defaultServices);
                          }
                        }}
                        className={`action-btn priority-${action.priority}`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
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

      {/* Quotation Modal */}
      {showQuotationModal && selectedQuotation && (
        <div className="quotation-modal-overlay" onClick={() => setShowQuotationModal(false)}>
          <div className="quotation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Quotation Details</h3>
              <button onClick={() => setShowQuotationModal(false)} className="modal-close">×</button>
            </div>
            
            <div className="modal-body">
              <div className="quotation-services-list">
                <h4>Services</h4>
                {selectedQuotation.services.map((service, idx) => (
                  <div key={idx} className="service-item">
                    <div className="service-header">
                      <strong>{service.name}</strong>
                      <span className="service-price">${service.basePrice.toFixed(2)}</span>
                    </div>
                    <p className="service-description">{service.description}</p>
                    <div className="service-timeline">Timeline: {service.timeline}</div>
                  </div>
                ))}
              </div>
              
              <div className="quotation-pricing">
                <div className="pricing-row">
                  <span>Subtotal:</span>
                  <span>${selectedQuotation.pricing.subtotal.toFixed(2)}</span>
                </div>
                
                {selectedQuotation.pricing.discounts.map((discount, idx) => (
                  <div key={idx} className="pricing-row discount">
                    <span>{discount.description}:</span>
                    <span>-${discount.amount.toFixed(2)}</span>
                  </div>
                ))}
                
                <div className="pricing-row total">
                  <strong>Total:</strong>
                  <strong>${selectedQuotation.pricing.total.toFixed(2)}</strong>
                </div>
              </div>
              
              <div className="quotation-validity">
                Valid until: {new Date(selectedQuotation.validUntil).toLocaleDateString()}
              </div>
            </div>
            
            <div className="modal-footer">
              <button
                onClick={() => rejectQuotation(selectedQuotation.id, 'Not interested')}
                className="btn-reject"
              >
                Decline
              </button>
              <button
                onClick={() => acceptQuotation(selectedQuotation.id)}
                className="btn-accept"
              >
                Accept Quotation
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .chat-interface {
          display: flex;
          flex-direction: column;
          height: 600px;
          max-width: 450px;
          border: none;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%);
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%);
          backdrop-filter: blur(10px);
          border-radius: 24px 24px 0 0;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
          background: rgba(255, 255, 255, 0.15);
          padding: 6px 12px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
        }

        .connection-status.connected .status-dot {
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        }

        .connection-status.connecting .status-dot {
          background: #f59e0b;
          box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
          animation: pulse 1.5s infinite;
        }

        .close-chat-btn {
          background: rgba(255, 255, 255, 0.15);
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: white;
          padding: 8px;
          border-radius: 12px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .close-chat-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: scale(1.05);
        }

        .chat-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(20px);
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 75%;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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
          margin-bottom: 6px;
          font-size: 11px;
          color: rgba(0, 0, 0, 0.5);
          font-weight: 600;
        }

        .sender-name {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .message-time {
          font-size: 10px;
          opacity: 0.7;
        }

        .message-content {
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
        }

        .message.customer .message-content {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border-bottom-right-radius: 6px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .message.agent .message-content {
          background: rgba(255, 255, 255, 0.9);
          color: #1f2937;
          border: 1px solid rgba(99, 102, 241, 0.1);
          border-bottom-left-radius: 6px;
          backdrop-filter: blur(10px);
        }

        .message.system .message-content {
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%);
          color: #92400e;
          border: 1px solid rgba(245, 158, 11, 0.3);
          font-style: italic;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .typing-indicator {
          opacity: 0.8;
        }

        .typing-dots {
          display: inline-flex;
          gap: 3px;
          margin-right: 8px;
        }

        .typing-dots span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          animation: typing 1.4s infinite ease-in-out;
          box-shadow: 0 0 4px rgba(99, 102, 241, 0.4);
        }

        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        .typing-text {
          font-size: 12px;
          color: #6b7280;
          font-style: italic;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%);
          color: #991b1b;
          border-top: 2px solid rgba(239, 68, 68, 0.3);
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(10px);
        }

        .error-dismiss {
          background: rgba(239, 68, 68, 0.1);
          border: none;
          color: #991b1b;
          cursor: pointer;
          font-size: 18px;
          margin-left: auto;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .error-dismiss:hover {
          background: rgba(239, 68, 68, 0.2);
          transform: scale(1.1);
        }

        .chat-status {
          padding: 12px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
        }

        .status-message {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }

        .status-message.waiting {
          color: #92400e;
          background: rgba(251, 191, 36, 0.1);
        }

        .status-message.active {
          color: #065f46;
          background: rgba(16, 185, 129, 0.1);
        }

        .status-message.closed {
          color: #991b1b;
          background: rgba(239, 68, 68, 0.1);
        }

        .chat-input {
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          padding: 20px;
          background: rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(20px);
        }

        .input-container {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }

        .message-input {
          flex: 1;
          border: 2px solid rgba(99, 102, 241, 0.2);
          border-radius: 24px;
          padding: 12px 20px;
          font-size: 14px;
          resize: none;
          outline: none;
          font-family: inherit;
          max-height: 120px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
          color: #1f2937;
        }

        .message-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
          background: white;
        }

        .message-input:disabled {
          background: rgba(243, 244, 246, 0.5);
          color: #9ca3af;
          cursor: not-allowed;
        }

        .message-input::placeholder {
          color: #9ca3af;
        }

        .send-button {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border: none;
          border-radius: 50%;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 18px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .send-button:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
        }

        .send-button:active:not(:disabled) {
          transform: scale(0.95);
        }

        .send-button:disabled {
          background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
          cursor: not-allowed;
          opacity: 0.5;
        }

        .typing-indicator-self {
          font-size: 11px;
          color: #6b7280;
          margin-top: 6px;
          font-style: italic;
          padding-left: 4px;
        }

        .loading-message {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #6b7280;
          font-style: italic;
          font-size: 14px;
        }

        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.6;
            transform: scale(1.1);
          }
        }

        @keyframes typing {
          0%, 80%, 100% { 
            transform: scale(0);
            opacity: 0.5;
          }
          40% { 
            transform: scale(1);
            opacity: 1;
          }
        }

        /* Scrollbar styling */
        .messages-container::-webkit-scrollbar {
          width: 6px;
        }

        .messages-container::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
        }

        .messages-container::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 10px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        }

        /* Quotation styles */
        .quotation-preview {
          margin-top: 12px;
          padding: 16px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%);
          border: 2px solid rgba(59, 130, 246, 0.3);
          border-radius: 16px;
          backdrop-filter: blur(10px);
        }

        .quotation-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          color: #1e40af;
          font-weight: 700;
          font-size: 15px;
        }

        .quotation-icon {
          font-size: 20px;
        }

        .quotation-summary {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 13px;
          color: #1e3a8a;
          font-weight: 600;
        }

        .quotation-total {
          font-weight: 700;
          font-size: 14px;
        }

        .view-quotation-btn {
          width: 100%;
          padding: 10px 16px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .view-quotation-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }

        .view-quotation-btn:active {
          transform: translateY(0);
        }

        .suggested-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .action-btn {
          padding: 8px 16px;
          border: 2px solid rgba(99, 102, 241, 0.3);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.9);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .action-btn:hover {
          background: white;
          border-color: #6366f1;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .action-btn.priority-high {
          border-color: rgba(239, 68, 68, 0.5);
          color: #dc2626;
        }

        .action-btn.priority-high:hover {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.05);
        }

        .action-btn.priority-medium {
          border-color: rgba(245, 158, 11, 0.5);
          color: #d97706;
        }

        .action-btn.priority-medium:hover {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.05);
        }

        /* Quotation Modal */
        .quotation-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .quotation-modal {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(249, 250, 251, 0.95) 100%);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          width: 90%;
          max-width: 550px;
          max-height: 85vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.5);
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 28px;
          border-bottom: 2px solid rgba(99, 102, 241, 0.1);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
        }

        .modal-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #1f2937;
        }

        .modal-close {
          background: rgba(0, 0, 0, 0.05);
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .modal-close:hover {
          background: rgba(0, 0, 0, 0.1);
          transform: scale(1.05);
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px 28px;
        }

        .quotation-services-list h4 {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 700;
        }

        .service-item {
          padding: 16px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%);
          border-radius: 16px;
          margin-bottom: 16px;
          border: 1px solid rgba(99, 102, 241, 0.1);
          transition: all 0.3s ease;
        }

        .service-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .service-header strong {
          color: #1f2937;
          font-size: 16px;
          font-weight: 700;
        }

        .service-price {
          color: #6366f1;
          font-weight: 700;
          font-size: 16px;
        }

        .service-description {
          margin: 8px 0;
          font-size: 14px;
          color: #6b7280;
          line-height: 1.6;
        }

        .service-timeline {
          font-size: 12px;
          color: #d97706;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.15) 100%);
          padding: 6px 12px;
          border-radius: 8px;
          display: inline-block;
          margin-top: 6px;
          font-weight: 600;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .quotation-pricing {
          margin-top: 24px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
          border-radius: 16px;
          border: 2px solid rgba(99, 102, 241, 0.1);
        }

        .pricing-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 15px;
          color: #374151;
        }

        .pricing-row.discount {
          color: #059669;
          font-weight: 600;
        }

        .pricing-row.total {
          border-top: 3px solid rgba(99, 102, 241, 0.2);
          margin-top: 12px;
          padding-top: 16px;
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
        }

        .quotation-validity {
          margin-top: 16px;
          padding: 12px 16px;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%);
          border-radius: 12px;
          font-size: 13px;
          color: #92400e;
          text-align: center;
          font-weight: 600;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .modal-footer {
          display: flex;
          gap: 16px;
          padding: 24px 28px;
          border-top: 2px solid rgba(99, 102, 241, 0.1);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.02) 0%, rgba(139, 92, 246, 0.02) 100%);
        }

        .modal-footer button {
          flex: 1;
          padding: 14px 24px;
          border: none;
          border-radius: 16px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-reject {
          background: rgba(0, 0, 0, 0.05);
          color: #6b7280;
          border: 2px solid rgba(0, 0, 0, 0.1);
        }

        .btn-reject:hover {
          background: rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .btn-accept {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .btn-accept:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }

        .btn-accept:active,
        .btn-reject:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;