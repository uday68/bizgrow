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

        /* Quotation styles */
        .quotation-preview {
          margin-top: 12px;
          padding: 12px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
        }

        .quotation-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          color: #0369a1;
          font-weight: 600;
        }

        .quotation-icon {
          font-size: 18px;
        }

        .quotation-summary {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 13px;
          color: #0c4a6e;
        }

        .quotation-total {
          font-weight: 600;
        }

        .view-quotation-btn {
          width: 100%;
          padding: 6px 12px;
          background: #0284c7;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        .view-quotation-btn:hover {
          background: #0369a1;
        }

        .suggested-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .action-btn {
          padding: 4px 10px;
          border: 1px solid #e1e5e9;
          border-radius: 12px;
          background: white;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: #f8f9fa;
          border-color: #007bff;
        }

        .action-btn.priority-high {
          border-color: #dc3545;
          color: #dc3545;
        }

        .action-btn.priority-medium {
          border-color: #ffc107;
          color: #856404;
        }

        /* Quotation Modal */
        .quotation-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .quotation-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e1e5e9;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 18px;
          color: #1a1a1a;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6c757d;
          padding: 0;
          width: 30px;
          height: 30px;
          border-radius: 4px;
        }

        .modal-close:hover {
          background: #f8f9fa;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .quotation-services-list h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .service-item {
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .service-header strong {
          color: #1a1a1a;
          font-size: 15px;
        }

        .service-price {
          color: #007bff;
          font-weight: 600;
          font-size: 15px;
        }

        .service-description {
          margin: 6px 0;
          font-size: 13px;
          color: #6c757d;
          line-height: 1.4;
        }

        .service-timeline {
          font-size: 12px;
          color: #856404;
          background: #fff3cd;
          padding: 4px 8px;
          border-radius: 4px;
          display: inline-block;
          margin-top: 4px;
        }

        .quotation-pricing {
          margin-top: 20px;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .pricing-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 14px;
        }

        .pricing-row.discount {
          color: #28a745;
        }

        .pricing-row.total {
          border-top: 2px solid #dee2e6;
          margin-top: 8px;
          padding-top: 12px;
          font-size: 16px;
        }

        .quotation-validity {
          margin-top: 12px;
          padding: 8px 12px;
          background: #fff3cd;
          border-radius: 6px;
          font-size: 12px;
          color: #856404;
          text-align: center;
        }

        .modal-footer {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #e1e5e9;
        }

        .modal-footer button {
          flex: 1;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-reject {
          background: #f8f9fa;
          color: #6c757d;
        }

        .btn-reject:hover {
          background: #e9ecef;
        }

        .btn-accept {
          background: #28a745;
          color: white;
        }

        .btn-accept:hover {
          background: #218838;
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;