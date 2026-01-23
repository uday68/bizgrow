import React, { useState, useEffect } from 'react';
import { websocketService } from '../services/websocketService';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Mail, 
  CheckCircle, 
  Clock, 
  MapPin, 
  DollarSign,
  Bot,
  Zap,
  Globe,
  Building,
  Target,
  Activity,
  AlertCircle,
  Play,
  Pause,
  Settings,
  Eye,
  Send,
  Wrench,
  Wifi,
  WifiOff
} from 'lucide-react';

interface BusinessMetrics {
  totalDiscovered: number;
  proposalsSent: number;
  interestedResponses: number;
  projectsBuilt: number;
  activeRegions: string[];
  peakSalesData: {
    region: string;
    revenue: number;
    growth: number;
  }[];
  recentActivity: {
    id: string;
    type: 'discovery' | 'proposal' | 'interest' | 'build';
    business: string;
    timestamp: string;
    status: 'success' | 'pending' | 'failed';
  }[];
}

interface AIAgent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  tasksCompleted: number;
  currentTask?: string;
  performance: number;
}

const DeveloperDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<BusinessMetrics>({
    totalDiscovered: 1247,
    proposalsSent: 89,
    interestedResponses: 23,
    projectsBuilt: 12,
    activeRegions: ['New York', 'Los Angeles', 'Chicago', 'Austin'],
    peakSalesData: [
      { region: 'New York', revenue: 45200, growth: 18 },
      { region: 'Los Angeles', revenue: 32800, growth: 15 },
      { region: 'Chicago', revenue: 28400, growth: 22 },
      { region: 'Austin', revenue: 19600, growth: 25 }
    ],
    recentActivity: [
      { id: '1', type: 'discovery', business: 'Tony\'s Pizzeria', timestamp: '2 min ago', status: 'success' },
      { id: '2', type: 'proposal', business: 'Green Leaf Cafe', timestamp: '5 min ago', status: 'success' },
      { id: '3', type: 'interest', business: 'Metro Auto Repair', timestamp: '8 min ago', status: 'success' },
      { id: '4', type: 'build', business: 'Sunrise Bakery', timestamp: '12 min ago', status: 'pending' }
    ]
  });

  const [agents, setAgents] = useState<AIAgent[]>([
    {
      id: 'discovery',
      name: 'Business Discovery Agent',
      status: 'active',
      tasksCompleted: 247,
      currentTask: 'Scanning restaurants in Austin, TX',
      performance: 94
    },
    {
      id: 'proposal',
      name: 'Proposal Generation Agent',
      status: 'active',
      tasksCompleted: 89,
      currentTask: 'Creating pitch for Mario\'s Pizza',
      performance: 87
    },
    {
      id: 'builder',
      name: 'Project Builder Agent',
      status: 'idle',
      tasksCompleted: 23,
      performance: 96
    },
    {
      id: 'analytics',
      name: 'Market Analytics Agent',
      status: 'active',
      tasksCompleted: 156,
      currentTask: 'Analyzing NYC restaurant trends',
      performance: 91
    }
  ]);

  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [bulkScanProgress, setBulkScanProgress] = useState<any>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    websocketService.connect();
    
    // Set up event listeners
    websocketService.on('all', (data) => {
      setIsConnected(websocketService.isConnected());
    });

    websocketService.on('agent_status_change', (data) => {
      setAgents(prev => prev.map(agent => 
        agent.id === data.agentId 
          ? { ...agent, status: data.status }
          : agent
      ));
    });

    websocketService.on('bulk_discovery_progress', (data) => {
      setBulkScanProgress(data.progress);
    });

    websocketService.on('proposal_generated', (data) => {
      setMetrics(prev => ({
        ...prev,
        proposalsSent: prev.proposalsSent + 1,
        recentActivity: [
          {
            id: Date.now().toString(),
            type: 'proposal',
            business: data.proposal.businessName || 'Unknown Business',
            timestamp: 'Just now',
            status: 'success'
          },
          ...prev.recentActivity.slice(0, 9)
        ]
      }));
    });

    websocketService.on('project_build_started', (data) => {
      setMetrics(prev => ({
        ...prev,
        recentActivity: [
          {
            id: Date.now().toString(),
            type: 'build',
            business: 'Project Build Started',
            timestamp: 'Just now',
            status: 'pending'
          },
          ...prev.recentActivity.slice(0, 9)
        ]
      }));
    });

    websocketService.on('automated_discovery_completed', () => {
      fetchMetrics();
    });

    websocketService.on('automated_proposals_completed', () => {
      fetchMetrics();
    });

    websocketService.on('automated_building_completed', () => {
      fetchMetrics();
    });

    // Initial data fetch
    fetchMetrics();

    // Set up periodic updates
    const interval = setInterval(() => {
      if (!websocketService.isConnected()) {
        fetchMetrics();
      }
    }, 30000); // Fallback polling every 30 seconds

    return () => {
      clearInterval(interval);
      websocketService.disconnect();
    };
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/developer/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      // Keep existing data on error
    }
  };

  const toggleAgent = async (agentId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/toggle`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // WebSocket will handle the update
      }
    } catch (error) {
      console.error('Failed to toggle agent:', error);
    }
  };

  const triggerBulkDiscovery = async () => {
    try {
      setBulkScanProgress({ progress: 0, region: 'Starting...', query: '' });
      await fetch('http://localhost:3001/api/agents/discovery/bulk-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions: ['NYC', 'LA', 'Chicago', 'Austin'] })
      });
    } catch (error) {
      console.error('Failed to trigger bulk discovery:', error);
      setBulkScanProgress(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'idle': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'discovery': return <Users size={16} className="text-blue-600" />;
      case 'proposal': return <Mail size={16} className="text-purple-600" />;
      case 'interest': return <CheckCircle size={16} className="text-green-600" />;
      case 'build': return <Wrench size={16} className="text-orange-600" />;
      default: return <Activity size={16} className="text-gray-600" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            Developer Control Center
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
          </h1>
          <p className="text-slate-500 flex items-center gap-2">
            AI-powered business automation dashboard
            {isConnected ? <Wifi size={16} className="text-green-600" /> : <WifiOff size={16} className="text-red-600" />}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setAutomationEnabled(!automationEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors ${
              automationEnabled 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            {automationEnabled ? <Play size={18} /> : <Pause size={18} />}
            {automationEnabled ? 'Automation ON' : 'Automation OFF'}
          </button>
          <button
            onClick={triggerBulkDiscovery}
            disabled={bulkScanProgress !== null}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Zap size={18} />
            {bulkScanProgress ? `Scanning... ${bulkScanProgress.progress || 0}%` : 'Bulk Scan'}
          </button>
        </div>
      </div>

      {/* Bulk Scan Progress */}
      {bulkScanProgress && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-indigo-900">
              Bulk Discovery Progress: {bulkScanProgress.region} - {bulkScanProgress.query}
            </span>
            <span className="text-sm font-bold text-indigo-700">{bulkScanProgress.progress}%</span>
          </div>
          <div className="w-full bg-indigo-200 rounded-full h-2">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${bulkScanProgress.progress}%` }}
            />
          </div>
          {bulkScanProgress.progress >= 100 && (
            <p className="text-xs text-indigo-600 mt-2">✓ Bulk discovery completed successfully!</p>
          )}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { 
            label: 'Businesses Discovered', 
            value: metrics.totalDiscovered.toLocaleString(), 
            icon: Building, 
            color: 'text-blue-600', 
            bg: 'bg-blue-50',
            change: '+12%'
          },
          { 
            label: 'Proposals Sent', 
            value: metrics.proposalsSent.toLocaleString(), 
            icon: Send, 
            color: 'text-purple-600', 
            bg: 'bg-purple-50',
            change: '+8%'
          },
          { 
            label: 'Interested Responses', 
            value: metrics.interestedResponses.toLocaleString(), 
            icon: Target, 
            color: 'text-green-600', 
            bg: 'bg-green-50',
            change: '+23%'
          },
          { 
            label: 'Projects Built', 
            value: metrics.projectsBuilt.toLocaleString(), 
            icon: Wrench, 
            color: 'text-orange-600', 
            bg: 'bg-orange-50',
            change: '+15%'
          }
        ].map((metric, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className={`${metric.bg} ${metric.color} p-3 rounded-xl`}>
                <metric.icon size={24} />
              </div>
              <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded">
                {metric.change}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-1">{metric.value}</h3>
            <p className="text-sm text-slate-500">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* AI Agents Status */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bot size={24} className="text-indigo-600" />
            AI Agents Status
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {agents.map((agent) => (
              <div key={agent.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{agent.name}</h3>
                    <p className="text-xs text-slate-500">{agent.tasksCompleted} tasks completed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${getStatusColor(agent.status)}`}>
                      {agent.status.toUpperCase()}
                    </span>
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
                
                {agent.currentTask && (
                  <div className="mb-3">
                    <p className="text-sm text-slate-600 italic">"{agent.currentTask}"</p>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Performance</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${agent.performance}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">{agent.performance}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Regional Analytics & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Regional Performance */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin size={24} className="text-green-600" />
              Regional Performance
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {[
                { region: 'New York', businesses: 1247, conversion: 18, revenue: '$45,200' },
                { region: 'Los Angeles', businesses: 892, conversion: 15, revenue: '$32,800' },
                { region: 'Chicago', businesses: 634, conversion: 22, revenue: '$28,400' },
                { region: 'Austin', businesses: 423, conversion: 25, revenue: '$19,600' }
              ].map((region, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                  <div>
                    <h3 className="font-semibold text-slate-900">{region.region}</h3>
                    <p className="text-sm text-slate-500">{region.businesses} businesses discovered</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{region.revenue}</p>
                    <p className="text-xs text-slate-500">{region.conversion}% conversion</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity size={24} className="text-purple-600" />
              Live Activity Feed
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {metrics.recentActivity.map((activity, idx) => (
                <div key={activity.id || idx} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="flex-shrink-0">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {activity.business}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {activity.type.replace('_', ' ')} • {activity.timestamp}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    activity.status === 'success' ? 'bg-green-500' :
                    activity.status === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                </div>
              ))}
              {metrics.recentActivity.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <Activity size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No recent activity</p>
                  <p className="text-xs">AI agents will appear here when active</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <Eye size={20} className="text-blue-600" />
            <div className="text-left">
              <p className="font-semibold text-slate-900">View All Leads</p>
              <p className="text-xs text-slate-500">Browse discovered businesses</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <BarChart3 size={20} className="text-green-600" />
            <div className="text-left">
              <p className="font-semibold text-slate-900">Analytics Report</p>
              <p className="text-xs text-slate-500">Generate detailed insights</p>
            </div>
          </button>
          <button className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <Settings size={20} className="text-purple-600" />
            <div className="text-left">
              <p className="font-semibold text-slate-900">Agent Settings</p>
              <p className="text-xs text-slate-500">Configure AI behavior</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeveloperDashboard;