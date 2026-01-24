
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
  Plus,
  Shield,
  User,
  LogOut
} from 'lucide-react';
import LeadSearch from './components/LeadSearch';
import Dashboard from './components/Dashboard';
import ProposalView from './components/ProposalView';
import DeveloperDashboard from './components/DeveloperDashboardSimple';
import ModernDashboard from './components/ModernDashboard';
import AdminPanel from './components/AdminPanel';
import ProtectedRoute from './components/ProtectedRoute';
import LoginForm from './components/LoginForm';
import { BusinessLead } from './types';
import { apiService } from './services/apiService';
import './styles/glassmorphism.css';

const Sidebar = () => {
  const user = apiService.getUser();
  
  const handleLogout = async () => {
    await apiService.logout();
    window.location.reload();
  };

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-lg">
          <TrendingUp size={24} />
        </div>
        <span className="font-bold text-xl tracking-tight">BizGrow AI</span>
      </div>
      
      {/* User Info */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center">
            <User size={20} className="text-white" />
          </div>
          <div>
            <p className="font-medium text-sm">
              {user?.firstName} {user?.lastName}
            </p>
            <div className="flex items-center gap-1">
              <Shield size={12} className="text-slate-400" />
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        <Link to="/" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
          <LayoutDashboard size={20} className="text-slate-400 group-hover:text-white" />
          <span className="font-medium">Dashboard</span>
        </Link>
        
        {/* Developer/Admin only routes */}
        {apiService.hasRole('developer') && (
          <>
            <Link to="/developer" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
              <TrendingUp size={20} className="text-slate-400 group-hover:text-white" />
              <span className="font-medium">AI Engine</span>
            </Link>
            <Link to="/modern" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
              <TrendingUp size={20} className="text-slate-400 group-hover:text-white" />
              <span className="font-medium">Modern Dashboard</span>
            </Link>
          </>
        )}

        {/* Admin only routes */}
        {apiService.hasRole('admin') && (
          <Link to="/admin" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
            <Shield size={20} className="text-slate-400 group-hover:text-white" />
            <span className="font-medium">Admin Panel</span>
          </Link>
        )}
        
        <Link to="/search" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
          <Search size={20} className="text-slate-400 group-hover:text-white" />
          <span className="font-medium">Lead Finder</span>
        </Link>
        <Link to="/proposals" className="flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors group">
          <FileText size={20} className="text-slate-400 group-hover:text-white" />
          <span className="font-medium">My Proposals</span>
        </Link>
      </nav>
      
      {/* Logout Button */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-3 hover:bg-red-600/20 rounded-lg transition-colors group text-left"
        >
          <LogOut size={20} className="text-slate-400 group-hover:text-red-400" />
          <span className="font-medium group-hover:text-red-400">Sign Out</span>
        </button>
      </div>
      
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        &copy; 2024 BizGrow IT Services
      </div>
    </aside>
  );
};

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
      <ProtectedRoute>
        <div className="flex bg-slate-50 min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-8">
            <Routes>
              <Route path="/" element={<Dashboard leads={savedLeads} onUpdateStatus={handleUpdateLeadStatus} />} />
              <Route 
                path="/developer" 
                element={
                  <ProtectedRoute requiredRole="developer">
                    <DeveloperDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/modern" 
                element={
                  <ProtectedRoute requiredRole="developer">
                    <ModernDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminPanel />
                  </ProtectedRoute>
                } 
              />
              <Route path="/search" element={<LeadSearch onSaveLead={handleSaveLead} savedLeadIds={savedLeads.map(l => l.id)} />} />
              <Route path="/proposal/:id" element={<ProposalView leads={savedLeads} />} />
              <Route path="/login" element={<LoginForm />} />
            </Routes>
          </main>
        </div>
      </ProtectedRoute>
    </HashRouter>
  );
};

export default App;
