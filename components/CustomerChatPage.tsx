import React, { useState } from 'react';
import { MessageSquare, Send, Sparkles, User, Mail } from 'lucide-react';
import ChatInterface from './ChatInterface';

export const CustomerChatPage: React.FC = () => {
  const [showChat, setShowChat] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: ''
  });

  const handleStartChat = () => {
    if (customerInfo.name.trim()) {
      setShowChat(true);
    }
  };

  if (showChat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          <ChatInterface
            customerName={customerInfo.name}
            customerEmail={customerInfo.email}
            className="shadow-2xl"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Welcome Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-indigo-100">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-lg rounded-full mb-4">
              <MessageSquare className="text-white" size={40} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome to BizGrow Support
            </h1>
            <p className="text-indigo-100 text-lg">
              We're here to help you grow your business
            </p>
          </div>

          {/* Form */}
          <div className="p-8">
            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                  <User size={16} />
                  Your Name *
                </label>
                <input
                  type="text"
                  value={customerInfo.name}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  onKeyPress={(e) => e.key === 'Enter' && handleStartChat()}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                  <Mail size={16} />
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={customerInfo.email}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  onKeyPress={(e) => e.key === 'Enter' && handleStartChat()}
                />
              </div>

              <button
                onClick={handleStartChat}
                disabled={!customerInfo.name.trim()}
                className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white py-4 rounded-xl font-semibold text-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
              >
                <Send size={20} className="group-hover:translate-x-1 transition-transform" />
                Start Chat
              </button>
            </div>

            {/* Features */}
            <div className="mt-8 pt-8 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600" />
                What you can expect:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-600 font-bold">⚡</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">Instant Response</h4>
                    <p className="text-xs text-slate-600">Get help immediately</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-600 font-bold">🤖</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">AI-Powered</h4>
                    <p className="text-xs text-slate-600">Smart assistance</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-pink-600 font-bold">👥</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">Human Support</h4>
                    <p className="text-xs text-slate-600">Real agents available</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-600">
          <p>By starting a chat, you agree to our Terms of Service and Privacy Policy</p>
        </div>
      </div>
    </div>
  );
};

export default CustomerChatPage;
