import React, { useState, useEffect } from 'react';
import { Database, Activity, AlertTriangle, CheckCircle, Clock, HardDrive, Zap } from 'lucide-react';
import { apiService } from '../services/apiService';

interface DatabaseHealth {
  healthy: boolean;
  responseTime: number;
  connections: {
    active: number;
    idle: number;
    total: number;
    max: number;
  };
  performance: {
    avgQueryTime: string;
    slowQueries: number;
    errorRate: string;
  };
  storage: {
    size: string;
    tables: number;
    indexes: number;
  };
  lastCheck: string;
}

const DatabaseHealthPage: React.FC = () => {
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchHealth();
    
    if (autoRefresh) {
      const interval = setInterval(fetchHealth, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchHealth = async () => {
    try {
      const response = await fetch('/api/database-health', {
        headers: {
          'Authorization': `Bearer ${apiService.getToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
      }
    } catch (error) {
      console.error('Failed to fetch database health:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthStatus = () => {
    if (!health) return { color: 'gray', text: 'Unknown', icon: AlertTriangle };
    if (health.healthy && health.responseTime < 100) {
      return { color: 'green', text: 'Excellent', icon: CheckCircle };
    }
    if (health.healthy && health.responseTime < 500) {
      return { color: 'blue', text: 'Good', icon: CheckCircle };
    }
    if (health.healthy) {
      return { color: 'yellow', text: 'Fair', icon: AlertTriangle };
    }
    return { color: 'red', text: 'Critical', icon: AlertTriangle };
  };

  const status = getHealthStatus();
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-lg">
                <Database className="text-white" size={28} />
              </div>
              Database Health
            </h1>
            <p className="text-slate-600 mt-2">Monitor database performance and health metrics</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchHealth}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold"
            >
              Refresh Now
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-indigo-600"></div>
          <p className="mt-4 text-slate-600">Loading database health...</p>
        </div>
      ) : health ? (
        <>
          {/* Overall Status */}
          <div className={`bg-${status.color}-50 border-2 border-${status.color}-200 rounded-2xl p-6`}>
            <div className="flex items-center gap-4">
              <div className={`p-4 bg-${status.color}-100 rounded-xl`}>
                <StatusIcon className={`text-${status.color}-600`} size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Database Status: {status.text}</h2>
                <p className="text-slate-600 mt-1">
                  Last checked: {new Date(health.lastCheck).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Response Time */}
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Zap className="text-purple-600" size={24} />
                </div>
                <h3 className="font-semibold text-slate-900">Response Time</h3>
              </div>
              <div className="text-3xl font-bold text-slate-900">{health.responseTime}ms</div>
              <div className="text-sm text-slate-600 mt-1">
                {health.responseTime < 100 ? 'Excellent' : health.responseTime < 500 ? 'Good' : 'Slow'}
              </div>
            </div>

            {/* Connections */}
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Activity className="text-blue-600" size={24} />
                </div>
                <h3 className="font-semibold text-slate-900">Connections</h3>
              </div>
              <div className="text-3xl font-bold text-slate-900">
                {health.connections.active}/{health.connections.max}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {health.connections.idle} idle
              </div>
            </div>

            {/* Query Performance */}
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Clock className="text-green-600" size={24} />
                </div>
                <h3 className="font-semibold text-slate-900">Avg Query Time</h3>
              </div>
              <div className="text-3xl font-bold text-slate-900">{health.performance.avgQueryTime}</div>
              <div className="text-sm text-slate-600 mt-1">
                {health.performance.slowQueries} slow queries
              </div>
            </div>

            {/* Storage */}
            <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <HardDrive className="text-orange-600" size={24} />
                </div>
                <h3 className="font-semibold text-slate-900">Storage</h3>
              </div>
              <div className="text-3xl font-bold text-slate-900">{health.storage.size}</div>
              <div className="text-sm text-slate-600 mt-1">
                {health.storage.tables} tables, {health.storage.indexes} indexes
              </div>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Connection Pool */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Connection Pool</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">Active Connections</span>
                    <span className="font-semibold text-slate-900">
                      {health.connections.active} / {health.connections.max}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(health.connections.active / health.connections.max) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-600">Idle Connections</span>
                    <span className="font-semibold text-slate-900">{health.connections.idle}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${(health.connections.idle / health.connections.max) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Metrics</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Average Query Time</span>
                  <span className="font-semibold text-slate-900">{health.performance.avgQueryTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Slow Queries</span>
                  <span className="font-semibold text-slate-900">{health.performance.slowQueries}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Error Rate</span>
                  <span className="font-semibold text-slate-900">{health.performance.errorRate}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <AlertTriangle className="mx-auto text-red-500" size={64} />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Unable to fetch database health</h3>
          <p className="mt-2 text-slate-600">Please check your connection and try again</p>
        </div>
      )}
    </div>
  );
};

export default DatabaseHealthPage;
