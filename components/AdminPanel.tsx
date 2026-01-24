import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  Users, 
  Clock, 
  Ban, 
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Plus,
  Eye,
  Settings
} from 'lucide-react';
import { apiService } from '../services/apiService';

interface RateLimitAnalytics {
  violations: Array<{
    key: string;
    count: number;
    firstSeen: number;
    lastSeen: number;
    userId?: string;
  }>;
  suspiciousIPs: Array<[string, number]>;
  activeRateLimits: Array<{
    key: string;
    data: any;
  }>;
  summary: {
    totalViolations: number;
    uniqueIPs: number;
    suspiciousIPCount: number;
    activeRateLimitCount: number;
  };
}

interface WhitelistEntry {
  ip: string;
  reason: string;
  addedAt: string;
  addedBy: string;
}

const AdminPanel: React.FC = () => {
  const [analytics, setAnalytics] = useState<RateLimitAnalytics | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'violations' | 'whitelist' | 'settings'>('overview');
  const [newWhitelistIP, setNewWhitelistIP] = useState('');
  const [newWhitelistReason, setNewWhitelistReason] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      const [analyticsData, whitelistData] = await Promise.all([
        apiService.getRateLimitAnalytics(),
        apiService.getWhitelist()
      ]);
      
      setAnalytics(analyticsData);
      setWhitelist(whitelistData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRateLimit = async (key: string) => {
    try {
      await apiService.resetRateLimit(key);
      fetchData(); // Refresh data
    } catch (err: any) {
      setError(err.message || 'Failed to reset rate limit');
    }
  };

  const handleAddToWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelistIP.trim()) return;

    try {
      await apiService.addToWhitelist(newWhitelistIP.trim(), newWhitelistReason.trim() || 'Added via admin panel');
      setNewWhitelistIP('');
      setNewWhitelistReason('');
      fetchData(); // Refresh data
    } catch (err: any) {
      setError(err.message || 'Failed to add to whitelist');
    }
  };

  const handleRemoveFromWhitelist = async (ip: string) => {
    try {
      await apiService.removeFromWhitelist(ip);
      fetchData(); // Refresh data
    } catch (err: any) {
      setError(err.message || 'Failed to remove from whitelist');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <span className="ml-4 text-white text-lg">Loading Admin Panel...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                <p className="text-white/70">Security & Rate Limiting Management</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white hover:bg-white/20 transition-all duration-200 flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="backdrop-blur-xl bg-red-500/20 border border-red-500/30 rounded-2xl p-4 mb-6 shadow-2xl">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <p className="text-red-200">{error}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-2 mb-6 shadow-2xl">
          <div className="flex space-x-2">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'violations', label: 'Violations', icon: AlertTriangle },
              { id: 'whitelist', label: 'Whitelist', icon: CheckCircle2 },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                  activeTab === id
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Total Violations</p>
                  <p className="text-2xl font-bold text-white">{analytics.summary.totalViolations}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Unique IPs</p>
                  <p className="text-2xl font-bold text-white">{analytics.summary.uniqueIPs}</p>
                </div>
                <Users className="h-8 w-8 text-blue-400" />
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Suspicious IPs</p>
                  <p className="text-2xl font-bold text-white">{analytics.summary.suspiciousIPCount}</p>
                </div>
                <Ban className="h-8 w-8 text-orange-400" />
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Active Limits</p>
                  <p className="text-2xl font-bold text-white">{analytics.summary.activeRateLimitCount}</p>
                </div>
                <Clock className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'violations' && analytics && (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Recent Violations</h3>
            <div className="space-y-4">
              {analytics.violations.slice(0, 20).map((violation, index) => (
                <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{violation.key}</p>
                      <p className="text-white/70 text-sm">
                        {violation.count} violations • Last seen: {new Date(violation.lastSeen).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleResetRateLimit(violation.key)}
                      className="bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-1 text-blue-200 hover:bg-blue-500/30 transition-colors duration-200"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'whitelist' && (
          <div className="space-y-6">
            {/* Add to Whitelist Form */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Add to Whitelist</h3>
              <form onSubmit={handleAddToWhitelist} className="space-y-4">
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">IP Address</label>
                  <input
                    type="text"
                    value={newWhitelistIP}
                    onChange={(e) => setNewWhitelistIP(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Reason</label>
                  <input
                    type="text"
                    value={newWhitelistReason}
                    onChange={(e) => setNewWhitelistReason(e.target.value)}
                    placeholder="Trusted source"
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add to Whitelist</span>
                </button>
              </form>
            </div>

            {/* Whitelist Entries */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Whitelisted IPs</h3>
              <div className="space-y-4">
                {whitelist.map((entry, index) => (
                  <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{entry.ip}</p>
                        <p className="text-white/70 text-sm">{entry.reason}</p>
                        <p className="text-white/50 text-xs">
                          Added: {new Date(entry.addedAt).toLocaleString()} by {entry.addedBy}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveFromWhitelist(entry.ip)}
                        className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-1 text-red-200 hover:bg-red-500/30 transition-colors duration-200 flex items-center space-x-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ))}
                {whitelist.length === 0 && (
                  <p className="text-white/60 text-center py-8">No whitelisted IPs</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Security Settings</h3>
            <div className="space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-white font-medium mb-2">Rate Limiting Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-white/70">Authentication: 5 attempts / 15 minutes</p>
                    <p className="text-white/70">API Requests: 1000 requests / 15 minutes</p>
                  </div>
                  <div>
                    <p className="text-white/70">Agent Operations: 10 operations / minute</p>
                    <p className="text-white/70">Webhooks: 100 webhooks / minute</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-white font-medium mb-2">Security Features</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white/70">HTTPS Enforcement</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white/70">Input Sanitization</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white/70">SQL Injection Protection</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-white/70">Security Headers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;