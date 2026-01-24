import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface ErrorData {
  id: string;
  timestamp: string;
  message: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  path?: string;
  userId?: string;
  correlationId: string;
}

interface ErrorStatistics {
  total: number;
  lastHour: number;
  lastDay: number;
  patterns: number;
  correlations: number;
  topPatterns: Array<{
    pattern: string;
    count: number;
  }>;
}

interface ErrorAnalysis {
  topErrors: Array<{
    fingerprint: string;
    count: number;
    pattern: any;
  }>;
  errorTrends: Array<{
    window: string;
    count: number;
  }>;
  correlatedErrors: Array<{
    correlationId: string;
    errorCount: number;
    timeSpan: number;
    errorTypes: string[];
  }>;
  lastAnalysisTime: string;
}

const ErrorDashboard: React.FC = () => {
  const [errors, setErrors] = useState<ErrorData[]>([]);
  const [statistics, setStatistics] = useState<ErrorStatistics | null>(null);
  const [analysis, setAnalysis] = useState<ErrorAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    fetchErrorData();
    const interval = setInterval(fetchErrorData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [selectedTimeRange, selectedSeverity, selectedCategory]);

  const fetchErrorData = async () => {
    try {
      setLoading(true);
      
      const [errorsResponse, statsResponse, analysisResponse] = await Promise.all([
        apiService.get('/api/errors/recent?limit=50'),
        apiService.get('/api/errors/stats/overview'),
        apiService.get('/api/errors/analysis/current')
      ]);

      if (errorsResponse.success) {
        setErrors(errorsResponse.data.errors);
      }
      
      if (statsResponse.success) {
        setStatistics(statsResponse.data);
      }
      
      if (analysisResponse.success) {
        setAnalysis(analysisResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch error data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeSpan = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (loading && !statistics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Error Tracking Dashboard</h1>
        <div className="flex space-x-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button
            onClick={fetchErrorData}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Total Errors</h3>
            <p className="text-2xl font-bold text-gray-900">{statistics.total}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Last Hour</h3>
            <p className="text-2xl font-bold text-orange-600">{statistics.lastHour}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Last Day</h3>
            <p className="text-2xl font-bold text-blue-600">{statistics.lastDay}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Error Patterns</h3>
            <p className="text-2xl font-bold text-purple-600">{statistics.patterns}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Correlations</h3>
            <p className="text-2xl font-bold text-green-600">{statistics.correlations}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Errors */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Errors</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {errors.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No errors found</p>
              ) : (
                errors.map((error) => (
                  <div key={error.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 truncate">{error.message}</h4>
                        <p className="text-sm text-gray-500">{error.type}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(error.severity)}`}>
                        {error.severity}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <span>{error.path || 'N/A'}</span>
                      <span>{formatTimestamp(error.timestamp)}</span>
                    </div>
                    {error.correlationId && (
                      <div className="mt-2 text-xs text-gray-400">
                        Correlation: {error.correlationId}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Top Error Patterns */}
        {analysis && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Top Error Patterns</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {analysis.topErrors.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No error patterns found</p>
                ) : (
                  analysis.topErrors.map((pattern, index) => (
                    <div key={pattern.fingerprint} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900">Pattern #{index + 1}</h4>
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-sm font-medium">
                          {pattern.count} occurrences
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{pattern.fingerprint}</p>
                      {pattern.pattern && (
                        <div className="mt-2 text-xs text-gray-500">
                          First seen: {formatTimestamp(pattern.pattern.firstSeen)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Trends and Correlations */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Error Trends */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Error Trends</h2>
            </div>
            <div className="p-6">
              <div className="space-y-2">
                {analysis.errorTrends.map((trend, index) => (
                  <div key={index} className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">
                      {new Date(trend.window).toLocaleTimeString()}
                    </span>
                    <div className="flex items-center">
                      <div 
                        className="bg-blue-200 h-4 rounded mr-2"
                        style={{ width: `${Math.max(trend.count * 10, 4)}px` }}
                      ></div>
                      <span className="text-sm font-medium">{trend.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Correlated Errors */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Correlated Errors</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {analysis.correlatedErrors.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No correlated errors found</p>
                ) : (
                  analysis.correlatedErrors.map((correlation) => (
                    <div key={correlation.correlationId} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900">
                          {correlation.errorCount} related errors
                        </h4>
                        <span className="text-sm text-gray-500">
                          {formatTimeSpan(correlation.timeSpan)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        ID: {correlation.correlationId}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {correlation.errorTypes.map((type) => (
                          <span key={type} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {analysis && analysis.lastAnalysisTime && (
        <div className="text-center text-sm text-gray-500">
          Last analysis: {formatTimestamp(analysis.lastAnalysisTime)}
        </div>
      )}
    </div>
  );
};

export default ErrorDashboard;