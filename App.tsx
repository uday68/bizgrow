
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { 
  Search, 
  LayoutDashboard, 
  MapPin, 
  FileText, 
  Briefcase, 
  TrendingUp,
  Mail,
  Phone,
  Globe,
  Star,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Plus
} from 'lucide-react';
import LeadSearch from './components/LeadSearch';
import Dashboard from './components/Dashboard';
import ProposalView from './components/ProposalView';
import { BusinessLead } from './types';

const Sidebar = () => (
  <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col fixed left-0 top-0 z-50">
    <div className="p-6 border-b border-slate-800 flex items-center gap-3">
      <div className="bg-indigo-600 p-2 rounded-lg">
        <TrendingUp size={24} />
      </div>
      <span className="font-bold text-xl tracking-tight">BizGrow AI</span>
    </div>
    
    <nav className="flex-1 p-4 space-y-2">
      <Link to="/" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
        <LayoutDashboard size={20} className="text-slate-400 group-hover:text-white" />
        <span className="font-medium">Dashboard</span>
      </Link>
      <Link to="/search" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
        <Search size={20} className="text-slate-400 group-hover:text-white" />
        <span className="font-medium">Lead Finder</span>
      </Link>
      <Link to="/proposals" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
        <FileText size={20} className="text-slate-400 group-hover:text-white" />
        <span className="font-medium">My Proposals</span>
      </Link>
    </nav>
    
    <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
      &copy; 2024 BizGrow IT Services
    </div>
  </aside>
);

const App: React.FC = () => {
  const [savedLeads, setSavedLeads] = useState<BusinessLead[]>(() => {
    const local = localStorage.getItem('bizgrow_leads');
    return local ? JSON.parse(local) : [];
  });

  useEffect(() => {
    localStorage.setItem('bizgrow_leads', JSON.stringify(savedLeads));
  }, [savedLeads]);

  const handleSaveLead = (lead: BusinessLead) => {
    if (!savedLeads.find(l => l.id === lead.id)) {
      setSavedLeads([...savedLeads, lead]);
    }
  };

  const handleUpdateLeadStatus = (id: string, status: BusinessLead['status']) => {
    setSavedLeads(savedLeads.map(l => l.id === id ? { ...l, status } : l));
  };

  return (
    <HashRouter>
      <div className="flex bg-slate-50 min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-64 p-8">
          <Routes>
            <Route path="/" element={<Dashboard leads={savedLeads} onUpdateStatus={handleUpdateLeadStatus} />} />
            <Route path="/search" element={<LeadSearch onSaveLead={handleSaveLead} savedLeadIds={savedLeads.map(l => l.id)} />} />
            <Route path="/proposal/:id" element={<ProposalView leads={savedLeads} />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
