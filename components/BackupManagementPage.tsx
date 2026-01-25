import React, { useState, useEffect } from 'react';
import { Database, Download, Upload, CheckCircle, AlertCircle, Clock, Trash2, Play, Square } from 'lucide-react';
import { apiService } from '../services/apiService';

interface Backup {
  name: string;
  size: number;
  created: string;
  type: string;
}

interface BackupStatus {
  isRunning: boolean;
  lastBackup: string | null;
  nextBackup: string | null;
  totalBackups: number;
}

const BackupManagementPage: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [backupList, backupStatus] = await Promise.all([
        apiService.get('/api/backup/list'),
        apiService.get('/api/backup/status')
      ]);
      
      setBackups(backupList.data || []);
      setStatus(backupStatus.data || null);
    } catch (error) {
      console.error('Failed to load backup data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      await apiService.post('/api/backup/create', { label: 'manual' });
      await loadData();
    } catch (error) {
      console.error('Failed to create backup:', error);
      alert('Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const restoreBackup = async (backupName: string) => {
    if (!confirm(`Are you sure you want to restore from ${backupName}? This will replace the current database.`)) {
      return;
    }

    setRestoring(true);
    try {
      await apiService.post('/api/backup/restore', { backupName });
      alert('Database restored successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to restore backup:', error);
      alert('Failed to restore backup');
    } finally {
      setRestoring(false);
    }
  };

  const deleteBackup = async (backupName: string) => {
    if (!confirm(`Are you sure you want to delete ${backupName}?`)) {
      return;
    }

    try {
      await apiService.delete(`/api/backup/${backupName}`);
      await loadData();
    } catch (error) {
      console.error('Failed to delete backup:', error);
      alert('Failed to delete backup');
    }
  };

  const toggleBackupService = async (start: boolean) => {
    try {
      await apiService.post(`/api/backup/${start ? 'start' : 'stop'}`);
      await loadData();
    } catch (error) {
      console.error('Failed to toggle backup service:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Backup Management</h1>
          <p className="text-gray-600 mt-1">Manage database backups and restore points</p>
        </div>
        <button
          onClick={createBackup}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download size={20} />
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Backup Service Status</h2>
          <button
            onClick={() => toggleBackupService(!status?.isRunning)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              status?.isRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {status?.isRunning ? <Square size={16} /> : <Play size={16} />}
            {status?.isRunning ? 'Stop Service' : 'Start Service'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${status?.isRunning ? 'bg-green-100' : 'bg-gray-100'}`}>
              {status?.isRunning ? (
                <CheckCircle className="text-green-600" size={24} />
              ) : (
                <AlertCircle className="text-gray-600" size={24} />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600">Service Status</p>
              <p className="font-semibold">{status?.isRunning ? 'Running' : 'Stopped'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-100">
              <Clock className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Last Backup</p>
              <p className="font-semibold">
                {status?.lastBackup ? new Date(status.lastBackup).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-100">
              <Database className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Backups</p>
              <p className="font-semibold">{status?.totalBackups || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Backups List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Available Backups</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {backups.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No backups available
            </div>
          ) : (
            backups.map((backup) => (
              <div key={backup.name} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-indigo-100">
                      <Database className="text-indigo-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{backup.name}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(backup.created).toLocaleString()} • {(backup.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => restoreBackup(backup.name)}
                      disabled={restoring}
                      className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                    >
                      <Upload size={16} />
                      Restore
                    </button>
                    <button
                      onClick={() => deleteBackup(backup.name)}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      <Trash2 size={16} />
                      Delete
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

export default BackupManagementPage;
