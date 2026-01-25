import React, { useState, useEffect } from 'react';
import { Building2, Users, Settings, Shield, TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { apiService } from '../services/apiService';

interface Tenant {
  id: string;
  name: string;
  domain: string;
  status: 'active' | 'suspended' | 'trial';
  plan: string;
  userCount: number;
  createdAt: string;
  settings: {
    maxUsers: number;
    maxStorage: number;
    features: string[];
  };
}

const TenantManagementPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tenants', {
        headers: {
          'Authorization': `Bearer ${apiService.getToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTenants(data.tenants || []);
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'suspended':
        return <XCircle className="text-red-500" size={20} />;
      case 'trial':
        return <AlertCircle className="text-yellow-500" size={20} />;
      default:
        return <AlertCircle className="text-gray-500" size={20} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'suspended':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'trial':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl shadow-lg">
                <Building2 className="text-white" size={28} />
              </div>
              Tenant Management
            </h1>
            <p className="text-slate-600 mt-2">Manage multi-tenant organizations and configurations</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold"
          >
            Create Tenant
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <Building2 className="text-indigo-600" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{tenants.length}</div>
              <div className="text-sm text-slate-600">Total Tenants</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {tenants.filter(t => t.status === 'active').length}
              </div>
              <div className="text-sm text-slate-600">Active</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertCircle className="text-yellow-600" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {tenants.filter(t => t.status === 'trial').length}
              </div>
              <div className="text-sm text-slate-600">Trial</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {tenants.reduce((sum, t) => sum + t.userCount, 0)}
              </div>
              <div className="text-sm text-slate-600">Total Users</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tenants List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-indigo-600"></div>
            <p className="mt-4 text-slate-600">Loading tenants...</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="mx-auto text-slate-300" size={64} />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No tenants found</h3>
            <p className="mt-2 text-slate-600">Create your first tenant to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {tenants.map((tenant) => (
              <div 
                key={tenant.id}
                className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setSelectedTenant(tenant)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(tenant.status)}
                      <h3 className="text-lg font-semibold text-slate-900">{tenant.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(tenant.status)}`}>
                        {tenant.status.toUpperCase()}
                      </span>
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                        {tenant.plan}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm text-slate-600 mt-3">
                      <div className="flex items-center gap-2">
                        <Users size={16} />
                        <span>{tenant.userCount} users</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield size={16} />
                        <span>{tenant.domain}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Settings size={16} />
                        <span>{tenant.settings.features.length} features</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-slate-600">
                      Created: {new Date(tenant.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantManagementPage;
