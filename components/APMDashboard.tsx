import React, { useState, useEffect, useRef } from 'react';
import { websocketService } from '../services/websocketService';
import { apiService } from '../services/apiService';

interface APMMetrics {
  timestamp: string;
  responseTime: {
    current: number;
    average: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    totalRequests: number;
  };
  errorRate: {
    current: number;
    total: number;
    errors: number;
    errorsByType: Record<string, number>;
  };
  systemResources: {
    cpu: {
      usage: number;
      loadAverage: number[];
      cores: number;
    };
    memory: {
      used: number;
      free: number;
      total: number;
      usage: number;
      heapUsed: number;
      heapTotal: number;
    };
    disk: {
      usage: number;
      free: number;
      total: number;
    };
  };
  business: {
    activeUsers: number;
    chatSessions: number;
    agentUtilization: number;
    conversionRate: number;
  };
  activeRequests: number;
  isMonitoring: boolean;
}

interface APMAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: string;
  resolved: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

interface APMDashboardProps {
  className?: string;
  refreshInterval?: number;
  showAlerts?: boolean;
  showCharts?: boolean;
  compactMode?: boolean;
}

export const APMDashboard: React.FC<APMDashboardProps> = ({
  className = '',
  refreshInterval = 5000,
  showAlerts = true,
  showCharts = true,
  compactMode = false
}) => {
  const [metrics, setMetrics] = useState<APMMetrics | null>(null);
  const [alerts, setAlerts] = useState<APMAlert[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<APMMetrics[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [hasRequiredRole, setHasRequiredRole] = useState(true);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout>();
  const maxHistoryPoints = 100;

  useEffect(() => {
    // Check if user has required role
    const user = apiService.getUser();
    if (!user || (user.role !== 'developer' && user.role !== 'admin')) {
      setHasRequiredRole(false);
      setError('Access denied. Developer or admin role required to view APM Dashboard.');
      return;
    }
    
    initializeDashboard();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    
    return () => stopAutoRefresh();
  }, [autoRefresh, refreshInterval]);

  const initializeDashboard = async () => {
    try {
      // Initial data fetch
      await fetchMetrics();
      await fetchAlerts();
      
      // Setup WebSocket for real-time updates
      setupWebSocketConnection();
      
      // Start auto-refresh
      if (autoRefresh) {
        startAutoRefresh();
      }
    } catch (error) {
      console.error('Failed to initialize APM dashboard:', error);
      setError('Failed to initialize dashboard');
    }
  };

  const setupWebSocketConnection = () => {
    try {
      websocketService.connect();
      
      websocketService.on('connected', () => {
        setIsConnected(true);
        setError(null);
      });

      websocketService.on('disconnected', () => {
        setIsConnected(false);
      });

      // Listen for real-time APM updates
      websocketService.on('apmMetricsUpdate', (data: APMMetrics) => {
        setMetrics(data);
        updateMetricsHistory(data);
      });

      websocketService.on('apmAlert', (alert: APMAlert) => {
        setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
      });

      websocketService.on('error', (error) => {
        console.error('WebSocket error:', error);
        setError('Real-time connection error');
      });

    } catch (error) {
      console.error('Failed to setup WebSocket connection:', error);
    }
  };

  const fetchMetrics = async () => {
    try {
      const result = await apiService.getAPMMetrics();
      
      if (result.success) {
        setMetrics(result.data);
        updateMetricsHistory(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch metrics');
      }
    } catch (error: any) {
      console.error('Failed to fetch APM metrics:', error);
      
      // Provide specific error messages
      if (error.message?.includes('401') || error.message?.includes('Authentication')) {
        setError('Authentication required. Please login with developer or admin role.');
      } else if (error.message?.includes('403') || error.message?.includes('Authorization')) {
        setError('Access denied. Developer or admin role required.');
      } else if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        setError('Network error. Please check your connection.');
      } else {
        setError('Failed to fetch metrics. Please try again.');
      }
    }
  };

  const fetchAlerts = async () => {
    try {
      const result = await apiService.getAPMAlerts();
      
      if (result.success) {
        setAlerts(result.data.alerts);
      }
    } catch (error) {
      console.error('Failed to fetch APM alerts:', error);
    }
  };

  const updateMetricsHistory = (newMetrics: APMMetrics) => {
    setMetricsHistory(prev => {
      const updated = [...prev, newMetrics];
      return updated.slice(-maxHistoryPoints);
    });
  };

  const startAutoRefresh = () => {
    stopAutoRefresh();
    refreshIntervalRef.current = setInterval(() => {
      fetchMetrics();
      fetchAlerts();
    }, refreshInterval);
  };

  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = undefined;
    }
  };

  const cleanup = () => {
    stopAutoRefresh();
    websocketService.disconnect();
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const result = await apiService.acknowledgeAPMAlert(alertId);

      if (result.success) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId 
            ? { ...alert, acknowledgedBy: 'current_user', acknowledgedAt: new Date().toISOString() }
            : alert
        ));
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStatusColor = (value: number, warning: number, critical: number) => {
    if (value >= critical) return 'text-red-600';
    if (value >= warning) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  if (error && !metrics) {
    return (
      <div className={`apm-dashboard error ${className}`}>
        <div className="error-message">
          <span className="error-icon">❌</span>
          <div className="error-content">
            <span className="error-text">{error}</span>
            {!hasRequiredRole && (
              <a href="/login" className="login-link">
                Go to Login
              </a>
            )}
          </div>
          {hasRequiredRole && (
            <button onClick={initializeDashboard} className="retry-button">
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`apm-dashboard loading ${className}`}>
        <div className="loading-spinner">
          <div className="spinner"></div>
          <span>Loading APM Dashboard...</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'performance', label: 'Performance', icon: '⚡' },
    { id: 'resources', label: 'Resources', icon: '💻' },
    { id: 'business', label: 'Business', icon: '📈' },
    { id: 'alerts', label: 'Alerts', icon: '🔔', badge: alerts.filter(a => !a.acknowledgedBy).length }
  ];

  return (
    <div className={`apm-dashboard ${compactMode ? 'compact' : ''} ${className}`}>
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>Application Performance Monitoring</h2>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Real-time' : 'Offline'}</span>
          </div>
        </div>
        
        <div className="header-controls">
          <select 
            value={selectedTimeRange} 
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="time-range-select"
          >
            <option value="5m">Last 5 minutes</option>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
          </select>
          
          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`auto-refresh-toggle ${autoRefresh ? 'active' : ''}`}
          >
            {autoRefresh ? '⏸️' : '▶️'} Auto-refresh
          </button>
          
          <button onClick={fetchMetrics} className="refresh-button">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-navigation">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="metrics-grid">
            {/* Response Time Summary */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Response Time</h3>
                <span className="metric-status">
                  {formatDuration(metrics.responseTime.current)}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Average</label>
                    <span>{formatDuration(metrics.responseTime.average)}</span>
                  </div>
                  <div className="stat">
                    <label>P95</label>
                    <span className={getStatusColor(metrics.responseTime.p95, 1000, 3000)}>
                      {formatDuration(metrics.responseTime.p95)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Throughput Summary */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Throughput</h3>
                <span className="metric-status">
                  {metrics.throughput.requestsPerSecond} req/s
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Total</label>
                    <span>{metrics.throughput.totalRequests.toLocaleString()}</span>
                  </div>
                  <div className="stat">
                    <label>Active</label>
                    <span>{metrics.activeRequests}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Rate Summary */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Error Rate</h3>
                <span className={`metric-status ${getStatusColor(metrics.errorRate.current * 100, 5, 10)}`}>
                  {(metrics.errorRate.current * 100).toFixed(2)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Errors</label>
                    <span>{metrics.errorRate.errors}</span>
                  </div>
                  <div className="stat">
                    <label>Total</label>
                    <span>{metrics.errorRate.total}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Health */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>System Health</h3>
                <span className="metric-status">
                  {metrics.systemResources.cpu.usage < 70 && metrics.systemResources.memory.usage < 80 ? '✅' : '⚠️'}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>CPU</label>
                    <span className={getStatusColor(metrics.systemResources.cpu.usage, 70, 90)}>
                      {metrics.systemResources.cpu.usage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="stat">
                    <label>Memory</label>
                    <span className={getStatusColor(metrics.systemResources.memory.usage, 80, 95)}>
                      {metrics.systemResources.memory.usage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Metrics Summary */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Business</h3>
                <span className="metric-status">
                  {metrics.business.activeUsers} users
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Sessions</label>
                    <span>{metrics.business.chatSessions}</span>
                  </div>
                  <div className="stat">
                    <label>Conversion</label>
                    <span>{metrics.business.conversionRate.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Alerts Summary */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Active Alerts</h3>
                <span className={`metric-status ${alerts.filter(a => !a.acknowledgedBy).length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {alerts.filter(a => !a.acknowledgedBy).length}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Critical</label>
                    <span className="text-red-600">
                      {alerts.filter(a => a.severity === 'critical' && !a.acknowledgedBy).length}
                    </span>
                  </div>
                  <div className="stat">
                    <label>Warning</label>
                    <span className="text-yellow-600">
                      {alerts.filter(a => a.severity === 'warning' && !a.acknowledgedBy).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="metrics-grid">
            {/* Response Time */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Response Time</h3>
                <span className="metric-status">
                  {formatDuration(metrics.responseTime.current)}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Average</label>
                    <span>{formatDuration(metrics.responseTime.average)}</span>
                  </div>
                  <div className="stat">
                    <label>P50</label>
                    <span>{formatDuration(metrics.responseTime.p50)}</span>
                  </div>
                  <div className="stat">
                    <label>P95</label>
                    <span className={getStatusColor(metrics.responseTime.p95, 1000, 3000)}>
                      {formatDuration(metrics.responseTime.p95)}
                    </span>
                  </div>
                  <div className="stat">
                    <label>P99</label>
                    <span className={getStatusColor(metrics.responseTime.p99, 2000, 5000)}>
                      {formatDuration(metrics.responseTime.p99)}
                    </span>
                  </div>
                </div>
                {showCharts && (
                  <div className="mini-chart">
                    <div className="chart-placeholder">Response Time Chart</div>
                  </div>
                )}
              </div>
            </div>

            {/* Throughput */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Throughput</h3>
                <span className="metric-status">
                  {metrics.throughput.requestsPerSecond} req/s
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Per Second</label>
                    <span>{metrics.throughput.requestsPerSecond}</span>
                  </div>
                  <div className="stat">
                    <label>Per Minute</label>
                    <span>{metrics.throughput.requestsPerMinute}</span>
                  </div>
                  <div className="stat">
                    <label>Total</label>
                    <span>{metrics.throughput.totalRequests.toLocaleString()}</span>
                  </div>
                  <div className="stat">
                    <label>Active</label>
                    <span>{metrics.activeRequests}</span>
                  </div>
                </div>
                {showCharts && (
                  <div className="mini-chart">
                    <div className="chart-placeholder">Throughput Chart</div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Rate */}
            <div className="metric-card full-width">
              <div className="metric-header">
                <h3>Error Rate</h3>
                <span className={`metric-status ${getStatusColor(metrics.errorRate.current * 100, 5, 10)}`}>
                  {(metrics.errorRate.current * 100).toFixed(2)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Total Errors</label>
                    <span>{metrics.errorRate.errors}</span>
                  </div>
                  <div className="stat">
                    <label>Total Requests</label>
                    <span>{metrics.errorRate.total}</span>
                  </div>
                </div>
                {Object.keys(metrics.errorRate.errorsByType).length > 0 && (
                  <div className="error-types">
                    <label>Error Types:</label>
                    {Object.entries(metrics.errorRate.errorsByType).map(([type, count]) => (
                      <div key={type} className="error-type">
                        <span className="error-type-name">{type}</span>
                        <span className="error-type-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && (
          <div className="metrics-grid">
            {/* CPU Usage */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>CPU Usage</h3>
                <span className={`metric-status ${getStatusColor(metrics.systemResources.cpu.usage, 70, 90)}`}>
                  {metrics.systemResources.cpu.usage.toFixed(1)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Cores</label>
                    <span>{metrics.systemResources.cpu.cores}</span>
                  </div>
                  <div className="stat">
                    <label>Load Avg (1m)</label>
                    <span>{metrics.systemResources.cpu.loadAverage[0].toFixed(2)}</span>
                  </div>
                  <div className="stat">
                    <label>Load Avg (5m)</label>
                    <span>{metrics.systemResources.cpu.loadAverage[1]?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="stat">
                    <label>Load Avg (15m)</label>
                    <span>{metrics.systemResources.cpu.loadAverage[2]?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill cpu"
                    style={{ width: `${Math.min(100, metrics.systemResources.cpu.usage)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Memory Usage */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Memory Usage</h3>
                <span className={`metric-status ${getStatusColor(metrics.systemResources.memory.usage, 80, 95)}`}>
                  {metrics.systemResources.memory.usage.toFixed(1)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Used</label>
                    <span>{formatBytes(metrics.systemResources.memory.used)}</span>
                  </div>
                  <div className="stat">
                    <label>Free</label>
                    <span>{formatBytes(metrics.systemResources.memory.free)}</span>
                  </div>
                  <div className="stat">
                    <label>Total</label>
                    <span>{formatBytes(metrics.systemResources.memory.total)}</span>
                  </div>
                  <div className="stat">
                    <label>Heap Used</label>
                    <span>{formatBytes(metrics.systemResources.memory.heapUsed)}</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill memory"
                    style={{ width: `${Math.min(100, metrics.systemResources.memory.usage)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Disk Usage */}
            {metrics.systemResources.disk && (
              <div className="metric-card">
                <div className="metric-header">
                  <h3>Disk Usage</h3>
                  <span className={`metric-status ${getStatusColor(metrics.systemResources.disk.usage, 80, 95)}`}>
                    {metrics.systemResources.disk.usage.toFixed(1)}%
                  </span>
                </div>
                <div className="metric-content">
                  <div className="metric-stats">
                    <div className="stat">
                      <label>Free</label>
                      <span>{formatBytes(metrics.systemResources.disk.free)}</span>
                    </div>
                    <div className="stat">
                      <label>Total</label>
                      <span>{formatBytes(metrics.systemResources.disk.total)}</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill cpu"
                      style={{ width: `${Math.min(100, metrics.systemResources.disk.usage)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Business Tab */}
        {activeTab === 'business' && (
          <div className="metrics-grid">
            {/* Business Metrics */}
            <div className="metric-card">
              <div className="metric-header">
                <h3>Active Users</h3>
                <span className="metric-status">
                  {metrics.business.activeUsers}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Current</label>
                    <span>{metrics.business.activeUsers}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <h3>Chat Sessions</h3>
                <span className="metric-status">
                  {metrics.business.chatSessions}
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Active</label>
                    <span>{metrics.business.chatSessions}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <h3>Agent Utilization</h3>
                <span className="metric-status">
                  {metrics.business.agentUtilization.toFixed(1)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Utilization</label>
                    <span>{metrics.business.agentUtilization.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill cpu"
                    style={{ width: `${Math.min(100, metrics.business.agentUtilization)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <h3>Conversion Rate</h3>
                <span className="metric-status">
                  {metrics.business.conversionRate.toFixed(2)}%
                </span>
              </div>
              <div className="metric-content">
                <div className="metric-stats">
                  <div className="stat">
                    <label>Rate</label>
                    <span>{metrics.business.conversionRate.toFixed(2)}%</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill memory"
                    style={{ width: `${Math.min(100, metrics.business.conversionRate)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="alerts-section">
            <h3>Active Alerts ({alerts.filter(a => !a.acknowledgedBy).length})</h3>
            {alerts.length > 0 ? (
              <div className="alerts-list">
                {alerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`alert ${alert.severity} ${alert.acknowledgedBy ? 'acknowledged' : ''}`}
                  >
                    <div className="alert-content">
                      <span className="alert-icon">{getAlertIcon(alert.severity)}</span>
                      <div className="alert-details">
                        <div className="alert-message">{alert.message}</div>
                        <div className="alert-time">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                          {alert.acknowledgedBy && (
                            <span className="acknowledged-by"> • Acknowledged</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!alert.acknowledgedBy && (
                      <button 
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="acknowledge-button"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-alerts">
                <span className="no-alerts-icon">✅</span>
                <p>No active alerts</p>
                <span className="no-alerts-text">All systems operating normally</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid" style={{ display: 'none' }}>
        {/* Response Time */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>Response Time</h3>
            <span className="metric-status">
              {formatDuration(metrics.responseTime.current)}
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Average</label>
                <span>{formatDuration(metrics.responseTime.average)}</span>
              </div>
              <div className="stat">
                <label>P95</label>
                <span className={getStatusColor(metrics.responseTime.p95, 1000, 3000)}>
                  {formatDuration(metrics.responseTime.p95)}
                </span>
              </div>
              <div className="stat">
                <label>P99</label>
                <span className={getStatusColor(metrics.responseTime.p99, 2000, 5000)}>
                  {formatDuration(metrics.responseTime.p99)}
                </span>
              </div>
            </div>
            {showCharts && (
              <div className="mini-chart">
                <div className="chart-placeholder">Response Time Chart</div>
              </div>
            )}
          </div>
        </div>

        {/* Throughput */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>Throughput</h3>
            <span className="metric-status">
              {metrics.throughput.requestsPerSecond} req/s
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Per Minute</label>
                <span>{metrics.throughput.requestsPerMinute}</span>
              </div>
              <div className="stat">
                <label>Total</label>
                <span>{metrics.throughput.totalRequests.toLocaleString()}</span>
              </div>
              <div className="stat">
                <label>Active</label>
                <span>{metrics.activeRequests}</span>
              </div>
            </div>
            {showCharts && (
              <div className="mini-chart">
                <div className="chart-placeholder">Throughput Chart</div>
              </div>
            )}
          </div>
        </div>

        {/* Error Rate */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>Error Rate</h3>
            <span className={`metric-status ${getStatusColor(metrics.errorRate.current * 100, 5, 10)}`}>
              {(metrics.errorRate.current * 100).toFixed(2)}%
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Total Errors</label>
                <span>{metrics.errorRate.errors}</span>
              </div>
              <div className="stat">
                <label>Total Requests</label>
                <span>{metrics.errorRate.total}</span>
              </div>
            </div>
            {Object.keys(metrics.errorRate.errorsByType).length > 0 && (
              <div className="error-types">
                <label>Error Types:</label>
                {Object.entries(metrics.errorRate.errorsByType).map(([type, count]) => (
                  <div key={type} className="error-type">
                    <span className="error-type-name">{type}</span>
                    <span className="error-type-count">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CPU Usage */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>CPU Usage</h3>
            <span className={`metric-status ${getStatusColor(metrics.systemResources.cpu.usage, 70, 90)}`}>
              {metrics.systemResources.cpu.usage.toFixed(1)}%
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Cores</label>
                <span>{metrics.systemResources.cpu.cores}</span>
              </div>
              <div className="stat">
                <label>Load Avg</label>
                <span>{metrics.systemResources.cpu.loadAverage[0].toFixed(2)}</span>
              </div>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill cpu"
                style={{ width: `${Math.min(100, metrics.systemResources.cpu.usage)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>Memory Usage</h3>
            <span className={`metric-status ${getStatusColor(metrics.systemResources.memory.usage, 80, 95)}`}>
              {metrics.systemResources.memory.usage.toFixed(1)}%
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Used</label>
                <span>{formatBytes(metrics.systemResources.memory.used)}</span>
              </div>
              <div className="stat">
                <label>Total</label>
                <span>{formatBytes(metrics.systemResources.memory.total)}</span>
              </div>
              <div className="stat">
                <label>Heap</label>
                <span>{formatBytes(metrics.systemResources.memory.heapUsed)}</span>
              </div>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill memory"
                style={{ width: `${Math.min(100, metrics.systemResources.memory.usage)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Business Metrics */}
        <div className="metric-card">
          <div className="metric-header">
            <h3>Business Metrics</h3>
            <span className="metric-status">
              {metrics.business.activeUsers} users
            </span>
          </div>
          <div className="metric-content">
            <div className="metric-stats">
              <div className="stat">
                <label>Chat Sessions</label>
                <span>{metrics.business.chatSessions}</span>
              </div>
              <div className="stat">
                <label>Agent Utilization</label>
                <span>{metrics.business.agentUtilization.toFixed(1)}%</span>
              </div>
              <div className="stat">
                <label>Conversion Rate</label>
                <span>{metrics.business.conversionRate.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <div className="footer-info">
          <span>Last updated: {new Date(metrics.timestamp).toLocaleTimeString()}</span>
          <span>Monitoring: {metrics.isMonitoring ? '✅ Active' : '❌ Inactive'}</span>
        </div>
      </div>

      <style jsx>{`
        .apm-dashboard {
          padding: 20px;
          background: #f8f9fa;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .apm-dashboard.compact {
          padding: 10px;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header-left h2 {
          margin: 0 0 5px 0;
          color: #1a1a1a;
          font-size: 24px;
          font-weight: 600;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #666;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #dc3545;
        }

        .status-dot.connected {
          background: #28a745;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .time-range-select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          font-size: 14px;
        }

        .auto-refresh-toggle {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }

        .auto-refresh-toggle.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .refresh-button {
          padding: 8px 12px;
          border: 1px solid #007bff;
          border-radius: 4px;
          background: #007bff;
          color: white;
          cursor: pointer;
          font-size: 14px;
        }

        .refresh-button:hover {
          background: #0056b3;
        }

        .tabs-navigation {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          padding: 8px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          overflow-x: auto;
        }

        .tab-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #666;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
          position: relative;
        }

        .tab-button:hover {
          background: #f8f9fa;
          color: #1a1a1a;
        }

        .tab-button.active {
          background: #007bff;
          color: white;
        }

        .tab-icon {
          font-size: 18px;
        }

        .tab-label {
          font-weight: 500;
        }

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          background: #dc3545;
          color: white;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
        }

        .tab-button.active .tab-badge {
          background: white;
          color: #007bff;
        }

        .tab-content {
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .alerts-section {
          margin-bottom: 20px;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .alerts-section h3 {
          margin: 0 0 15px 0;
          color: #1a1a1a;
          font-size: 18px;
          font-weight: 600;
        }

        .no-alerts {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }

        .no-alerts-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .no-alerts p {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
          margin: 0 0 8px 0;
        }

        .no-alerts-text {
          font-size: 14px;
          color: #666;
        }

        .alerts-section {
          margin-bottom: 20px;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .alerts-section h3 {
          margin: 0 0 15px 0;
          color: #1a1a1a;
          font-size: 18px;
          font-weight: 600;
        }

        .alerts-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .alert {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-radius: 6px;
          border-left: 4px solid;
        }

        .alert.warning {
          background: #fff3cd;
          border-left-color: #ffc107;
        }

        .alert.critical {
          background: #f8d7da;
          border-left-color: #dc3545;
        }

        .alert.acknowledged {
          opacity: 0.7;
        }

        .alert-content {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
        }

        .alert-icon {
          font-size: 18px;
        }

        .alert-message {
          font-weight: 500;
          color: #1a1a1a;
        }

        .alert-time {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }

        .acknowledged-by {
          color: #28a745;
          font-weight: 500;
        }

        .acknowledge-button {
          padding: 6px 12px;
          border: 1px solid #007bff;
          border-radius: 4px;
          background: #007bff;
          color: white;
          cursor: pointer;
          font-size: 12px;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }

        .apm-dashboard.compact .metrics-grid {
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }

        .metric-card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .metric-card.full-width {
          grid-column: 1 / -1;
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .metric-header h3 {
          margin: 0;
          color: #1a1a1a;
          font-size: 16px;
          font-weight: 600;
        }

        .metric-status {
          font-size: 18px;
          font-weight: 700;
          color: #007bff;
        }

        .metric-content {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .metric-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 10px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat label {
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }

        .stat span {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .text-green-600 {
          color: #16a34a !important;
        }

        .text-yellow-600 {
          color: #ca8a04 !important;
        }

        .text-red-600 {
          color: #dc2626 !important;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .progress-fill.cpu {
          background: linear-gradient(90deg, #28a745, #ffc107, #dc3545);
        }

        .progress-fill.memory {
          background: linear-gradient(90deg, #17a2b8, #ffc107, #dc3545);
        }

        .error-types {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .error-types label {
          font-size: 12px;
          color: #666;
          font-weight: 500;
          margin-bottom: 5px;
        }

        .error-type {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          background: #f8f9fa;
          border-radius: 4px;
          font-size: 12px;
        }

        .error-type-name {
          color: #666;
        }

        .error-type-count {
          font-weight: 600;
          color: #dc3545;
        }

        .mini-chart {
          height: 60px;
          background: #f8f9fa;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          font-size: 12px;
        }

        .chart-placeholder {
          color: #999;
          font-style: italic;
        }

        .dashboard-footer {
          padding: 15px 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .footer-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          color: #666;
        }

        .footer-info span {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 8px;
          color: #721c24;
        }

        .error-content {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }

        .error-text {
          font-weight: 500;
        }

        .login-link {
          display: inline-block;
          padding: 8px 16px;
          background: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
          align-self: flex-start;
        }

        .login-link:hover {
          background: #0056b3;
        }

        .retry-button {
          padding: 6px 12px;
          border: 1px solid #721c24;
          border-radius: 4px;
          background: white;
          color: #721c24;
          cursor: pointer;
          font-size: 14px;
        }

        .loading-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
          padding: 40px;
          color: #666;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column;
            gap: 15px;
            align-items: stretch;
          }

          .header-controls {
            justify-content: center;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .footer-info {
            flex-direction: column;
            gap: 10px;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
};

export default APMDashboard;