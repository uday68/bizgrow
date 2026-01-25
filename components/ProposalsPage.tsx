import React, { useState, useEffect } from 'react';
import { FileText, Calendar, DollarSign, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';
import { apiService } from '../services/apiService';

interface Proposal {
  id: string;
  businessId: string;
  businessName: string;
  services: string[];
  pricing: {
    subtotal: number;
    tax: number;
    total: number;
  };
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';
  createdAt: string;
  validUntil: string;
}

const ProposalsPage: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected'>('all');

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/proposals', {
        headers: {
          'Authorization': `Bearer ${apiService.getToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProposals(data.proposals || []);
      }
    } catch (error) {
      console.error('Failed to fetch proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <Clock className="text-gray-500" size={18} />;
      case 'sent':
        return <FileText className="text-blue-500" size={18} />;
      case 'viewed':
        return <Eye className="text-purple-500" size={18} />;
      case 'accepted':
        return <CheckCircle className="text-green-500" size={18} />;
      case 'rejected':
        return <XCircle className="text-red-500" size={18} />;
      default:
        return <FileText className="text-gray-500" size={18} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'sent':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'viewed':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'accepted':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const filteredProposals = filter === 'all' 
    ? proposals 
    : proposals.filter(p => p.status === filter);

  const stats = {
    total: proposals.length,
    draft: proposals.filter(p => p.status === 'draft').length,
    sent: proposals.filter(p => p.status === 'sent').length,
    viewed: proposals.filter(p => p.status === 'viewed').length,
    accepted: proposals.filter(p => p.status === 'accepted').length,
    rejected: proposals.filter(p => p.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl shadow-lg">
                <FileText className="text-white" size={28} />
              </div>
              Proposals
            </h1>
            <p className="text-slate-600 mt-2">Manage and track your business proposals</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={() => setFilter('all')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'all' 
              ? 'bg-indigo-50 border-indigo-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-sm text-slate-600 mt-1">Total</div>
        </button>

        <button
          onClick={() => setFilter('draft')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'draft' 
              ? 'bg-gray-50 border-gray-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-gray-700">{stats.draft}</div>
          <div className="text-sm text-slate-600 mt-1">Draft</div>
        </button>

        <button
          onClick={() => setFilter('sent')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'sent' 
              ? 'bg-blue-50 border-blue-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-blue-700">{stats.sent}</div>
          <div className="text-sm text-slate-600 mt-1">Sent</div>
        </button>

        <button
          onClick={() => setFilter('viewed')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'viewed' 
              ? 'bg-purple-50 border-purple-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-purple-700">{stats.viewed}</div>
          <div className="text-sm text-slate-600 mt-1">Viewed</div>
        </button>

        <button
          onClick={() => setFilter('accepted')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'accepted' 
              ? 'bg-green-50 border-green-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-green-700">{stats.accepted}</div>
          <div className="text-sm text-slate-600 mt-1">Accepted</div>
        </button>

        <button
          onClick={() => setFilter('rejected')}
          className={`p-4 rounded-xl border-2 transition-all ${
            filter === 'rejected' 
              ? 'bg-red-50 border-red-500' 
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-2xl font-bold text-red-700">{stats.rejected}</div>
          <div className="text-sm text-slate-600 mt-1">Rejected</div>
        </button>
      </div>

      {/* Proposals List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-indigo-600"></div>
            <p className="mt-4 text-slate-600">Loading proposals...</p>
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto text-slate-300" size={64} />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No proposals found</h3>
            <p className="mt-2 text-slate-600">
              {filter === 'all' 
                ? 'Create your first proposal to get started' 
                : `No ${filter} proposals at the moment`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredProposals.map((proposal) => (
              <div 
                key={proposal.id}
                className="p-6 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(proposal.status)}
                      <h3 className="text-lg font-semibold text-slate-900">
                        {proposal.businessName}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(proposal.status)}`}>
                        {proposal.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {proposal.services.map((service, idx) => (
                        <span 
                          key={idx}
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium"
                        >
                          {service}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-6 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        <span>Created: {new Date(proposal.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={16} />
                        <span>Valid until: {new Date(proposal.validUntil).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                      <DollarSign size={24} />
                      {proposal.pricing.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      Subtotal: ${proposal.pricing.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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

export default ProposalsPage;
