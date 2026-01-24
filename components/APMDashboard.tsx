import React, { useState, useEffect, useRef } from 'react';
import { websocketService } from '../services/websocketService';

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
  
  const refreshIntervalRef = useRef<NodeJS.Timeout>();
  const maxHistoryPoints = 100;

  useEffect(() => {
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
      const response = await fetch('/api/apm/metrics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const result = await response.json();
      if (result.success) {
        setMetrics(result.data);
        updateMetricsHistory(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'Failed to fetch metrics');
      }
    } catch (error) {
      console.error('Failed to fetch APM metrics:', error);
      setError('Failed to fetch metrics');
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/apm/alerts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }

      const result = await response.json();
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
      const response = await fetch(`/api/apm/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
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
          <span>{error}</span>
          <button onClick={initializeDashboard} className="retry-button">
            Retry
          </button>
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

      {/* Alerts Section */}
      {showAlerts && alerts.length > 0 && (
        <div className="alerts-section">
          <h3>Active Alerts ({alerts.filter(a => !a.acknowledgedBy).length})</h3>
          <div className="alerts-list">
            {alerts.slice(0, 5).map(alert => (
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
        </div>
      )}

      {/* Metrics Grid */}
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
          <span>Uptime: {formatDuration(process.uptime() * 1000)}</span>
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