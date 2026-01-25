import React, { useState, useEffect } from 'react';
import { Database, ArrowRight, CheckCircle, AlertCircle, Clock, RotateCcw, Play } from 'lucide-react';
import { apiService } from '../services/apiService';

interface Migration {
  version: string;
  name: string;
  executed: boolean;
  executedAt?: string;
}

interface MigrationStatus {
  currentVersion: string;
  pendingMigrations: number;
  lastMigration: string | null;
}

const MigrationManagementPage: React.FC = () => {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusData, availableMigrations, history] = await Promise.all([
        apiService.get('/api/migrations/status'),
        apiService.get('/api/migrations/available'),
        apiService.get('/api/migrations/history')
      ]);

      setStatus(statusData.data);
      
      const executedVersions = new Set(history.data.map((m: any) => m.version));
      const allMigrations = availableMigrations.data.map((m: any) => ({
        ...m,
        executed: executedVersions.has(m.version),
        executedAt: history.data.find((h: any) => h.version === m.version)?.executedAt
      }));

      setMigrations(allMigrations);
    } catch (error) {
      console.error('Failed to load migration data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runMigrations = async (dryRun = false) => {
    setRunning(true);
    try {
      const result = await apiService.post('/api/migrations/migrate', { dryRun });
      
      if (dryRun) {
        alert('Dry run completed successfully. Check console for details.');
        console.log('Dry run results:', result);
      } else {
        alert('Migrations completed successfully');
        await loadData();
      }
    } catch (error) {
      console.error('Failed to run migrations:', error);
      alert('Failed to run migrations');
    } finally {
      setRunning(false);
    }
  };

  const rollbackMigration = async (targetVersion: string) => {
    if (!confirm(`Are you sure you want to rollback to version ${targetVersion}? This cannot be undone.`)) {
      return;
    }

    setRunning(true);
    try {
      await apiService.post('/api/migrations/rollback', { targetVersion });
      alert('Rollback completed successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('Failed to rollback migration');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const pendingMigrations = migrations.filter(m => !m.executed);
  const executedMigrations = migrations.filter(m => m.executed);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Database Migrations</h1>
          <p className="text-gray-600 mt-1">Manage database schema versions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runMigrations(true)}
            disabled={running || pendingMigrations.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            <Play size={20} />
            Dry Run
          </button>
          <button
            onClick={() => runMigrations(false)}
            disabled={running || pendingMigrations.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowRight size={20} />
            {running ? 'Running...' : 'Run Migrations'}
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Migration Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-100">
              <Database className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Current Version</p>
              <p className="font-semibold">{status?.currentVersion || 'None'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${pendingMigrations.length > 0 ? 'bg-yellow-100' : 'bg-green-100'}`}>
              {pendingMigrations.length > 0 ? (
                <AlertCircle className="text-yellow-600" size={24} />
              ) : (
                <CheckCircle className="text-green-600" size={24} />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending Migrations</p>
              <p className="font-semibold">{pendingMigrations.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-100">
              <Clock className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Last Migration</p>
              <p className="font-semibold">
                {status?.lastMigration ? new Date(status.lastMigration).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Migrations */}
      {pendingMigrations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-yellow-200">
          <div className="p-6 border-b border-yellow-200 bg-yellow-50">
            <h2 className="text-xl font-semibold text-gray-900">Pending Migrations</h2>
            <p className="text-sm text-gray-600 mt-1">These migrations will be applied when you run migrations</p>
          </div>

          <div className="divide-y divide-gray-200">
            {pendingMigrations.map((migration) => (
              <div key={migration.version} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-yellow-100">
                      <Clock className="text-yellow-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{migration.name}</p>
                      <p className="text-sm text-gray-600">Version: {migration.version}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                    Pending
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Executed Migrations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Executed Migrations</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {executedMigrations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No migrations executed yet
            </div>
          ) : (
            executedMigrations.map((migration) => (
              <div key={migration.version} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-green-100">
                      <CheckCircle className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{migration.name}</p>
                      <p className="text-sm text-gray-600">
                        Version: {migration.version} • Executed: {migration.executedAt ? new Date(migration.executedAt).toLocaleString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Executed
                    </span>
                    <button
                      onClick={() => rollbackMigration(migration.version)}
                      disabled={running}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
                    >
                      <RotateCcw size={16} />
                      Rollback
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

export default MigrationManagementPage;
