
import React from 'react';
import { Link } from 'react-router-dom';
import { BusinessLead } from '../types';
import { 
  Users, 
  Target, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  MoreVertical,
  Mail,
  Phone,
  FileText
} from 'lucide-react';

interface DashboardProps {
  leads: BusinessLead[];
  onUpdateStatus: (id: string, status: BusinessLead['status']) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ leads, onUpdateStatus }) => {
  const stats = {
    total: leads.length,
    interested: leads.filter(l => l.status === 'interested').length,
    converted: leads.filter(l => l.status === 'converted').length,
    noWebsite: leads.filter(l => !l.website).length,
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Platform Dashboard</h1>
        <p className="text-slate-500">Manage your leads and digital transformation pipeline.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Leads', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Interested', value: stats.interested, icon: Target, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Converted', value: stats.converted, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Missing Website', value: stats.noWebsite, icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{item.label}</p>
                <h3 className="text-3xl font-bold text-slate-900">{item.value}</h3>
              </div>
              <div className={`${item.bg} ${item.color} p-3 rounded-xl`}>
                <item.icon size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-bold text-lg text-slate-900">Recent Leads</h2>
          <Link to="/search" className="text-indigo-600 text-sm font-semibold flex items-center gap-1 hover:underline">
            Find more <ArrowRight size={14} />
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Business</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Opportunity</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{lead.name}</div>
                    <div className="text-xs text-slate-400 max-w-xs truncate">{lead.address}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {lead.phoneNumber && <Phone size={14} className="text-slate-400" title={lead.phoneNumber} />}
                      {lead.website && <Mail size={14} className="text-slate-400" />}
                      {!lead.website && <span className="text-rose-500 text-[10px] font-bold uppercase">No Web</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={lead.status}
                      onChange={(e) => onUpdateStatus(lead.id, e.target.value as BusinessLead['status'])}
                      className={`text-xs font-bold px-2 py-1 rounded border-none outline-none cursor-pointer
                        ${lead.status === 'new' ? 'bg-blue-100 text-blue-700' : ''}
                        ${lead.status === 'interested' ? 'bg-amber-100 text-amber-700' : ''}
                        ${lead.status === 'converted' ? 'bg-green-100 text-green-700' : ''}
                        ${lead.status === 'contacted' ? 'bg-slate-100 text-slate-700' : ''}
                      `}
                    >
                      <option value="new">NEW</option>
                      <option value="contacted">CONTACTED</option>
                      <option value="interested">INTERESTED</option>
                      <option value="converted">CONVERTED</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {lead.potentialServices.slice(0, 2).map((s, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      to={`/proposal/${lead.id}`} 
                      className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    >
                      <FileText size={14} />
                      Pitch
                    </Link>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                    No leads saved yet. Go to the Lead Finder to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
