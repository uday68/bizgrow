import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Bot, 
  TrendingUp, 
  Users, 
  Mail, 
  Building, 
  Zap, 
  Globe, 
  Clock,
  Play,
  Pause,
  RefreshCw,
  Eye,
  Target,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Settings,
  Bell,
  Search
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { websocketService } from '../services/websocketService';

interface AgentStatus {
  isActive: boolean;
  currentTask: string | null;
  queueLength: number;
  isProcessing: boolean;
  status: string;
}

interface DashboardMetrics {
  totalDiscovered: number;
  proposalsSent: number;
  interestedResponses: number;
  projectsBuilt: number;
  activeRegions: string[];
  peakSalesData: Array<{
    region: string;
    revenue: number;
    growth: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    business: string;
    timestamp: string;
    status: string;
  }>;
  agents?: {
    discovery: AgentStatus;
    proposal: AgentStatus;
    builder: AgentStatus;
  };
}

interface LiveStats {
  activeAgents: number;
  totalTasks: number;
  completedToday: number;
  successRate: number;
}

const ModernDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats>({
    activeAgents: 0,
    totalTasks: 0,
    completedToday: 0,
    successRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    fetchMetrics();
    connectWebSocket();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    
    return () => {
      clearInterval(interval);
      websocketService.disconnect();
    };
  }, []);

  const connectWebSocket = () => {
    websocketService.connect();
    
    websocketService.on('all', (data) => {
      console.log('WebSocket data received:', data);
      setIsConnected(true);
      setLastUpdate(new Date());
      
      // Update metrics when we receive real-time data
      fetchMetrics();
    });
  };

  const fetchMetrics = async () => {
    try {
      setError(null);
      const data = await apiService.getDeveloperMetrics();
      setMetrics(data);
      
      // Calculate live stats
      const agents = data.agents || {};
      const activeCount = Object.values(agents).filter((agent: any) => agent.isActive).length;
      const totalQueue = Object.values(agents).reduce((sum: number, agent: any) => sum + (agent.queueLength || 0), 0);
      
      setLiveStats({
        activeAgents: activeCount,
        totalTasks: totalQueue,
        completedToday: data.totalDiscovered + data.proposalsSent + data.projectsBuilt,
        successRate: data.interestedResponses > 0 ? Math.round((data.interestedResponses / data.proposalsSent) * 100) : 0
      });
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setError('Failed to connect to the backend API. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAgent = async (agentId: string) => {
    try {
      await apiService.toggleAgent(agentId);
      fetchMetrics(); // Refresh data after toggle
    } catch (error) {
      console.error('Failed to toggle agent:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white/30 border-t-white mx-auto mb-4"></div>
          <p className="text-white/80 text-lg">Initializing AI Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Connection Error</h2>
          <p className="text-white/80 mb-6">{error}</p>
          <button 
            onClick={fetchMetrics}
            className="glass-button px-6 py-3 text-white font-medium rounded-xl hover:bg-white/20 transition-all duration-300"
          >
            <RefreshCw className="h-5 w-5 inline mr-2" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Modern Navbar */}
      <nav className="relative z-10 glass-nav p-4 m-4 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">BizGrow AI</h1>
                <p className="text-xs text-white/60">Autonomous Business Engine</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-white/80 text-sm">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>

            {/* Last Update */}
            <div className="text-white/60 text-sm">
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <input 
                type="text" 
                placeholder="Search agents, tasks..."
                className="glass-input pl-10 pr-4 py-2 w-64 text-white placeholder-white/40 rounded-xl"
              />
            </div>

            {/* Notifications */}
            <button className="glass-button p-2 rounded-xl relative">
              <Bell className="h-5 w-5 text-white" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
            </button>

            {/* Settings */}
            <button className="glass-button p-2 rounded-xl">
              <Settings className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 p-6 space-y-6">
        {/* Live Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm font-medium">Active AI Agents</p>
                <p className="text-3xl font-bold text-white mt-1">{liveStats.activeAgents}</p>
                <p className="text-green-400 text-sm mt-1">
                  <TrendingUp className="h-4 w-4 inline mr-1" />
                  All systems operational
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                <Bot className="h-6 w-6 text-green-400" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm font-medium">Tasks in Queue</p>
                <p className="text-3xl font-bold text-white mt-1">{liveStats.totalTasks}</p>
                <p className="text-blue-400 text-sm mt-1">
                  <Clock className="h-4 w-4 inline mr-1" />
                  Processing continuously
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center">
                <Activity className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm font-medium">Completed Today</p>
                <p className="text-3xl font-bold text-white mt-1">{liveStats.completedToday}</p>
                <p className="text-purple-400 text-sm mt-1">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  Across all agents
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center">
                <Target className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 hover:scale-105 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm font-medium">Success Rate</p>
                <p className="text-3xl font-bold text-white mt-1">{liveStats.successRate}%</p>
                <p className="text-yellow-400 text-sm mt-1">
                  <Zap className="h-4 w-4 inline mr-1" />
                  Proposal conversion
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-yellow-400" />
              </div>
            </div>
          </div>
        </div>

        {/* AI Agents Control Panel */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">AI Agent Control Center</h2>
            <button 
              onClick={fetchMetrics}
              className="glass-button px-4 py-2 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
            >
              <RefreshCw className="h-4 w-4 inline mr-2" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {metrics?.agents && Object.entries(metrics.agents).map(([agentId, agent]) => (
              <div key={agentId} className="glass-card-inner p-6 hover:bg-white/5 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${agent.isActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                    <h3 className="text-lg font-semibold text-white capitalize">{agentId} Agent</h3>
                  </div>
                  <button
                    onClick={() => toggleAgent(agentId)}
                    className={`glass-button p-2 rounded-lg ${agent.isActive ? 'text-red-400 hover:bg-red-500/20' : 'text-green-400 hover:bg-green-500/20'} transition-all duration-300`}
                  >
                    {agent.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Status</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      agent.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {agent.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Queue Length</span>
                    <span className="text-white font-medium">{agent.queueLength || 0}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">Processing</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      agent.isProcessing ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {agent.isProcessing ? 'Yes' : 'No'}
                    </span>
                  </div>

                  {agent.currentTask && (
                    <div className="mt-3 p-3 bg-white/5 rounded-lg">
                      <p className="text-white/60 text-xs mb-1">Current Task</p>
                      <p className="text-white text-sm">{agent.currentTask}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Business Metrics & Regional Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Business Pipeline */}
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-6">Business Pipeline</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="text-white">Businesses Discovered</span>
                </div>
                <span className="text-2xl font-bold text-white">{metrics?.totalDiscovered || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-green-400" />
                  <span className="text-white">Proposals Sent</span>
                </div>
                <span className="text-2xl font-bold text-white">{metrics?.proposalsSent || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Eye className="h-5 w-5 text-yellow-400" />
                  <span className="text-white">Interested Responses</span>
                </div>
                <span className="text-2xl font-bold text-white">{metrics?.interestedResponses || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Building className="h-5 w-5 text-purple-400" />
                  <span className="text-white">Projects Built</span>
                </div>
                <span className="text-2xl font-bold text-white">{metrics?.projectsBuilt || 0}</span>
              </div>
            </div>
          </div>

          {/* Regional Performance */}
          <div className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-6">Regional Performance</h3>
            <div className="space-y-4">
              {metrics?.peakSalesData?.map((region, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-300">
                  <div className="flex items-center space-x-3">
                    <Globe className="h-5 w-5 text-indigo-400" />
                    <div>
                      <p className="text-white font-medium">{region.region}</p>
                      <p className="text-white/60 text-sm">${region.revenue.toLocaleString()} revenue</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">+{region.growth}%</p>
                    <TrendingUp className="h-4 w-4 text-green-400 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Real-time Activity Feed */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Live Activity Feed</h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-white/60 text-sm">Real-time updates</span>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {metrics?.recentActivity?.map((activity) => (
              <div key={activity.id} className="flex items-center space-x-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-300">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <div className="flex-1">
                  <p className="text-white font-medium">
                    {activity.type} - {activity.business}
                  </p>
                  <p className="text-white/60 text-sm">{activity.timestamp}</p>
                </div>
                <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                  activity.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  activity.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                  activity.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {activity.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernDashboard;