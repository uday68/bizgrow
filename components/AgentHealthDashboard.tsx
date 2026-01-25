import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, TrendingUp, TrendingDown, RefreshCw, Zap } from 'lucide-react';
import { apiService } from '../services/apiService';

interface AgentHealth {
  agentName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  successRate: number;
  lastCheck: string;
}

interface CapacityMetrics {
  totalCapacity: number;
  usedCapacity: number;
  queueLength: number;
  isProcessingQueue: boolean;
}

const AgentHealthDashboard: React.FC = () => {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [capacity, setCapacity] = useState<CapacityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [healthData, capacityData] = await Promise.all([
        apiService.get('/api/agentHealth'),
        apiService.get('/api/capacity/metrics')
      ]);

      const healthArray = Object.entries(healthData.health || {}).map(([name, data]: [string, any]) => ({
        agentName: name,
        ...data
      }));

      setAgents(healthArray);
      setCapacity(capacityData.metrics);
    } catch (error) {
      console.error('Failed to load agent health data:', error);
    } finally {
      setLoading(false);
    }
  };

  const restartAgent = async (agentName: string) => {
    if (!confirm(`Are you sure you want to restart ${agentName}?`)) {
      return;
    }

    setRestarting(agentName);
    try {
      await apiService.post(`/api/agentHealth/${agentName}/restart`);
      await loadData();
    } catch (error) {
      console.error('Failed to restart agent:', error);
      alert('Failed to restart agent');
    } finally {
      setRestarting(null);
    }
  };

  const optimizeAgent = async (agentName: string) => {
    try {
      await apiService.post(`/api/agentHealth/${agentName}/optimize`);
      await loadData();
    } catch (error) {
      console.error('Failed to optimize agent:', error);
      alert('Failed to optimize agent');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'green';
      case 'degraded': return 'yellow';
      case 'unhealthy': return 'red';
      default: return 'gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="text-green-600" size={20} />;
      case 'degraded': return <AlertCircle className="text-yellow-600" size={20} />;
      case 'unhealthy': return <AlertCircle className="text-red-600" size={20} />;
      default: return <Activity className="text-gray-600" size={20} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const healthyAgents = agents.filter(a => a.status === 'healthy').length;
  const degradedAgents = agents.filter(a => a.status === 'degraded').length;
  const unhealthyAgents = agents.filter(a => a.status === 'unhealthy').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Agent Health & Capacity</h1>
          <p className="text-gray-600 mt-1">Monitor AI agent performance and resource usage</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <RefreshCw size={20} />
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Healthy Agents</p>
              <p className="text-2xl font-bold text-green-600">{healthyAgents}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-100">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Degraded</p>
              <p className="text-2xl font-bold text-yellow-600">{degradedAgents}</p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-100">
              <AlertCircle className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unhealthy</p>
              <p className="text-2xl font-bold text-red-600">{unhealthyAgents}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-100">
              <AlertCircle className="text-red-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Queue Length</p>
              <p className="text-2xl font-bold text-indigo-600">{capacity?.queueLength || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-100">
              <Activity className="text-indigo-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Capacity Overview */}
      {capacity && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Capacity Overview</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Capacity Usage</span>
                <span className="text-sm font-semibold">
                  {capacity.usedCapacity} / {capacity.totalCapacity}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    (capacity.usedCapacity / capacity.totalCapacity) > 0.8
                      ? 'bg-red-600'
                      : (capacity.usedCapacity / capacity.totalCapacity) > 0.6
                      ? 'bg-yellow-600'
                      : 'bg-green-600'
                  }`}
                  style={{ width: `${(capacity.usedCapacity / capacity.totalCapacity) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Zap className={capacity.isProcessingQueue ? 'text-green-600' : 'text-gray-400'} size={20} />
              <span className="text-sm text-gray-600">
                Queue Processing: {capacity.isProcessingQueue ? 'Active' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Agent List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Agent Status</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {agents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No agents registered
            </div>
          ) : (
            agents.map((agent) => (
              <div key={agent.agentName} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-3 rounded-lg bg-${getStatusColor(agent.status)}-100`}>
                      {getStatusIcon(agent.status)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{agent.agentName}</p>
                        <span className={`px-2 py-1 bg-${getStatusColor(agent.status)}-100 text-${getStatusColor(agent.status)}-700 rounded-full text-xs font-medium`}>
                          {agent.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4 mt-2">
                        <div>
                          <p className="text-xs text-gray-600">Requests</p>
                          <p className="text-sm font-semibold">{agent.requestCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Success Rate</p>
                          <p className="text-sm font-semibold flex items-center gap-1">
                            {(agent.successRate * 100).toFixed(1)}%
                            {agent.successRate >= 0.95 ? (
                              <TrendingUp className="text-green-600" size={14} />
                            ) : (
                              <TrendingDown className="text-red-600" size={14} />
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Avg Response</p>
                          <p className="text-sm font-semibold">{agent.avgResponseTime.toFixed(0)}ms</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Errors</p>
                          <p className="text-sm font-semibold text-red-600">{agent.errorCount}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => optimizeAgent(agent.agentName)}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                    >
                      Optimize
                    </button>
                    <button
                      onClick={() => restartAgent(agent.agentName)}
                      disabled={restarting === agent.agentName}
                      className="flex items-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50 text-sm"
                    >
                      <RefreshCw size={14} />
                      {restarting === agent.agentName ? 'Restarting...' : 'Restart'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentHealthDashboard;
