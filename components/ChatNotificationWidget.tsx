import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Bell, X } from 'lucide-react';
import { websocketService } from '../services/websocketService';
import { apiService } from '../services/apiService';

interface ChatNotification {
  id: string;
  sessionId: string;
  customerName: string;
  message: string;
  timestamp: Date;
  type: 'new_session' | 'new_message';
}

interface ChatNotificationWidgetProps {
  onOpenChat?: (sessionId: string) => void;
}

export const ChatNotificationWidget: React.FC<ChatNotificationWidgetProps> = ({ onOpenChat }) => {
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<ChatNotification | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    initializeNotifications();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const initializeNotifications = () => {
    // Setup WebSocket listeners
    websocketService.on('newSession', (data) => {
      const { session } = data;
      addNotification({
        sessionId: session.id,
        customerName: session.customerInfo.name,
        message: 'Started a new chat',
        type: 'new_session'
      });
    });

    websocketService.on('messageReceived', (data) => {
      const { message, session } = data;
      if (message.senderType === 'customer') {
        addNotification({
          sessionId: message.sessionId,
          customerName: session?.customerInfo?.name || 'Customer',
          message: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
          type: 'new_message'
        });
      }
    });
  };

  const addNotification = (notif: Omit<ChatNotification, 'id' | 'timestamp'>) => {
    const notification: ChatNotification = {
      ...notif,
      id: `notif_${Date.now()}`,
      timestamp: new Date()
    };
    
    setNotifications(prev => [notification, ...prev].slice(0, 10));
    setCurrentNotification(notification);
    setShowPopup(true);
    
    // Play sound
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
    
    // Auto-hide after 5 seconds
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 5000);
  };

  const handleNotificationClick = (sessionId: string) => {
    setShowPopup(false);
    if (onOpenChat) {
      onOpenChat(sessionId);
    }
  };

  return (
    <>
      {/* Notification Sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXvzn0pBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuIwUug8zx2Ik2CBhku+zooVARC0yl4fG5ZRwFNo3V7859KQUofsz" />
      
      {/* Popup Notification */}
      {showPopup && currentNotification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
          <div className="bg-white rounded-xl shadow-2xl border-2 border-indigo-500 p-4 w-80 cursor-pointer hover:shadow-3xl transition-all"
               onClick={() => handleNotificationClick(currentNotification.sessionId)}>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                <MessageSquare className="text-white" size={20} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-slate-900">{currentNotification.customerName}</h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPopup(false);
                    }}
                    className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <p className="text-sm text-slate-600 line-clamp-2">{currentNotification.message}</p>
                
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    currentNotification.type === 'new_session' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {currentNotification.type === 'new_session' ? 'New Chat' : 'New Message'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {currentNotification.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default ChatNotificationWidget;
