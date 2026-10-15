import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Search, 
  LayoutDashboard, 
  FileText, 
  TrendingUp,
  Shield,
  User,
  LogOut,
  Activity,
  AlertCircle,
  MessageSquare,
  Settings as SettingsIcon,
  Bell,
  ChevronDown,
  Menu,
  X,
  Database,
  Users,
  HardDrive,
  GitBranch,
  Cloud
} from 'lucide-react';
import LeadSearch from './components/LeadSearch';
import EnhancedLeadSearch from './components/EnhancedLeadSearch';
import ModernDashboard from './components/ModernDashboard';
import AdminPanel from './components/AdminPanel';
import APMDashboard from './components/APMDashboard';
import ErrorDashboard from './components/ErrorDashboard';
import ChatInterface from './components/ChatInterface';
import CustomerChatPage from './components/CustomerChatPage';
import AgentChatDashboard from './components/AgentChatDashboard';
import ProposalsPage from './components/ProposalsPage';
import Settings from './components/Settings';
import TenantManagementPage from './components/TenantManagementPage';
import DatabaseHealthPage from './components/DatabaseHealthPage';
import BackupManagementPage from './components/BackupManagementPage';
import MigrationManagementPage from './components/MigrationManagementPage';
import AgentHealthDashboard from './components/AgentHealthDashboard';
import NotificationCenter from './components/NotificationCenter';
import { ConnectorManagementPage } from './components/ConnectorManagementPage';

import ProtectedRoute from './components/ProtectedRoute';
import LoginForm from './components/LoginForm';
import { BusinessLead } from './types';
import { apiService } from './services/apiService';
import './styles/glassmorphism.css';

const Sidebar = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const user = apiService.getUser();
  const location = useLocation();
  
  const handleLogout = async () => {
    await apiService.logout();
    window.location.reload();
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/modern', icon: LayoutDashboard, label: 'Dashboard', color: 'indigo' },
    { path: '/enhanced-search', icon: Search, label: 'Lead Search', color: 'emerald' },
    { path: '/proposals', icon: FileText, label: 'Proposals', color: 'yellow' },
  ];

  const monitoringItems = [
    { path: '/agent-chat', icon: MessageSquare, label: 'Agent Chat', color: 'cyan', roles: ['admin', 'developer'] },
    { path: '/agent-health', icon: Activity, label: 'Agent Health', color: 'green', roles: ['admin', 'developer'] },
    { path: '/apm', icon: Activity, label: 'Performance', color: 'purple', roles: ['admin', 'developer'] },
    { path: '/errors', icon: AlertCircle, label: 'Errors', color: 'red', roles: ['admin', 'developer'] },
    { path: '/database-health', icon: Database, label: 'Database', color: 'blue', roles: ['admin', 'developer'] },
  ];

  const systemItems = [
    { path: '/connectors', icon: Cloud, label: 'Connectors & Ingestion', color: 'blue', roles: ['admin', 'developer'] },
    { path: '/tenants', icon: Users, label: 'Tenants', color: 'indigo', roles: ['admin'] },
    { path: '/backups', icon: HardDrive, label: 'Backups', color: 'teal', roles: ['admin'] },
    { path: '/migrations', icon: GitBranch, label: 'Migrations', color: 'orange', roles: ['admin'] },
  ];

  const adminItems = [
    { path: '/admin', icon: Shield, label: 'Admin Panel', color: 'red', roles: ['admin'] },
    { path: '/settings', icon: SettingsIcon, label: 'Settings', color: 'gray' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 z-50 h-screen w-72 
        bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 
        text-white border-r border-slate-700/50 shadow-2xl
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 lg:hidden p-2 rounded-lg hover:bg-slate-800/50"
        >
          <X size={20} />
        </button>

        {/* Logo Section */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 p-3 rounded-xl shadow-lg transform group-hover:scale-105 transition-transform">
                <TrendingUp size={24} className="text-white" />
              </div>
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                BizGrow AI
              </span>
              <p className="text-xs text-slate-400 font-medium">Business Automation</p>
            </div>
          </div>
        </div>
        
        {/* User Profile Card */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/30 hover:border-slate-600/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-blue-500 rounded-xl blur-md opacity-50"></div>
                <div className="relative w-12 h-12 bg-gradient-to-br from-green-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                  <User size={24} className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Shield size={12} className="text-blue-400 flex-shrink-0" />
                  <p className="text-blue-300 text-xs font-medium capitalize truncate">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* Main Navigation */}
          {navItems.map((item) => (
            <Link 
              key={item.path}
              to={item.path} 
              onClick={onClose}
              className={`
                flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative overflow-hidden
                ${isActive(item.path) 
                  ? `bg-${item.color}-500/20 border border-${item.color}-500/30` 
                  : 'hover:bg-slate-800/50'
                }
              `}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-${item.color}-500/10 to-${item.color}-500/10 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
              <div className={`
                relative flex items-center justify-center w-9 h-9 rounded-lg 
                ${isActive(item.path) 
                  ? `bg-${item.color}-500/30` 
                  : `bg-slate-800/50 group-hover:bg-${item.color}-500/20`
                }
                transition-colors
              `}>
                <item.icon size={18} className={`
                  ${isActive(item.path) 
                    ? `text-${item.color}-400` 
                    : `text-slate-400 group-hover:text-${item.color}-400`
                  }
                  transition-colors
                `} />
              </div>
              <span className={`
                relative font-medium text-sm transition-colors
                ${isActive(item.path) ? 'text-white' : 'text-slate-300 group-hover:text-white'}
              `}>
                {item.label}
              </span>
            </Link>
          ))}

          {/* Monitoring Section */}
          {(apiService.hasRole('admin') || apiService.hasRole('developer')) && (
            <>
              <div className="mt-6 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Monitoring</p>
              </div>
              
              {monitoringItems.map((item) => {
                if (item.roles && !item.roles.some(role => apiService.hasRole(role))) return null;
                return (
                  <Link 
                    key={item.path}
                    to={item.path} 
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative overflow-hidden
                      ${isActive(item.path) 
                        ? `bg-${item.color}-500/20 border border-${item.color}-500/30` 
                        : 'hover:bg-slate-800/50'
                      }
                    `}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r from-${item.color}-500/10 to-${item.color}-500/10 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                    <div className={`
                      relative flex items-center justify-center w-9 h-9 rounded-lg 
                      ${isActive(item.path) 
                        ? `bg-${item.color}-500/30` 
                        : `bg-slate-800/50 group-hover:bg-${item.color}-500/20`
                      }
                      transition-colors
                    `}>
                      <item.icon size={18} className={`
                        ${isActive(item.path) 
                          ? `text-${item.color}-400` 
                          : `text-slate-400 group-hover:text-${item.color}-400`
                        }
                        transition-colors
                      `} />
                    </div>
                    <span className={`
                      relative font-medium text-sm transition-colors
                      ${isActive(item.path) ? 'text-white' : 'text-slate-300 group-hover:text-white'}
                    `}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </>
          )}

          {/* System Management Section */}
          {apiService.hasRole('admin') && (
            <>
              <div className="mt-6 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">System Management</p>
              </div>
              
              {systemItems.map((item) => {
                if (item.roles && !item.roles.some(role => apiService.hasRole(role))) return null;
                return (
                  <Link 
                    key={item.path}
                    to={item.path} 
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative overflow-hidden
                      ${isActive(item.path) 
                        ? `bg-${item.color}-500/20 border border-${item.color}-500/30` 
                        : 'hover:bg-slate-800/50'
                      }
                    `}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r from-${item.color}-500/10 to-${item.color}-500/10 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                    <div className={`
                      relative flex items-center justify-center w-9 h-9 rounded-lg 
                      ${isActive(item.path) 
                        ? `bg-${item.color}-500/30` 
                        : `bg-slate-800/50 group-hover:bg-${item.color}-500/20`
                      }
                      transition-colors
                    `}>
                      <item.icon size={18} className={`
                        ${isActive(item.path) 
                          ? `text-${item.color}-400` 
                          : `text-slate-400 group-hover:text-${item.color}-400`
                        }
                        transition-colors
                      `} />
                    </div>
                    <span className={`
                      relative font-medium text-sm transition-colors
                      ${isActive(item.path) ? 'text-white' : 'text-slate-300 group-hover:text-white'}
                    `}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </>
          )}

          {/* Settings Section */}
          <div className="mt-6 mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Settings</p>
          </div>
          
          {adminItems.map((item) => {
            if (item.roles && !item.roles.some(role => apiService.hasRole(role))) return null;
            return (
              <Link 
                key={item.path}
                to={item.path} 
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative overflow-hidden
                  ${isActive(item.path) 
                    ? `bg-${item.color}-500/20 border border-${item.color}-500/30` 
                    : 'hover:bg-slate-800/50'
                  }
                `}
              >
                <div className={`absolute inset-0 bg-gradient-to-r from-${item.color}-500/10 to-${item.color}-500/10 opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                <div className={`
                  relative flex items-center justify-center w-9 h-9 rounded-lg 
                  ${isActive(item.path) 
                    ? `bg-${item.color}-500/30` 
                    : `bg-slate-800/50 group-hover:bg-${item.color}-500/20`
                  }
                  transition-colors
                `}>
                  <item.icon size={18} className={`
                    ${isActive(item.path) 
                      ? `text-${item.color}-400` 
                      : `text-slate-400 group-hover:text-${item.color}-400`
                    }
                    transition-colors
                  `} />
                </div>
                <span className={`
                  relative font-medium text-sm transition-colors
                  ${isActive(item.path) ? 'text-white' : 'text-slate-300 group-hover:text-white'}
                `}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        
        {/* Logout Button */}
        <div className="p-4 border-t border-slate-700/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 transition-all group"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/20 group-hover:bg-red-500/30 transition-colors">
              <LogOut size={18} className="text-red-400 group-hover:text-red-300 transition-colors" />
            </div>
            <span className="font-medium text-sm text-red-400 group-hover:text-red-300 transition-colors">Sign Out</span>
          </button>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-700/50">
          <p className="text-xs text-slate-500 text-center">
            &copy; 2024 BizGrow IT Services
          </p>
        </div>
      </aside>
    </>
  );
};

const App: React.FC = () => {
  const [savedLeads, setSavedLeads] = useState<BusinessLead[]>(() => {
    const local = localStorage.getItem('bizgrow_leads');
    return local ? JSON.parse(local) : [];
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <Routes>
        {/* Public Routes */}
        <Route path="/chat" element={<CustomerChatPage />} />
        <Route path="/login" element={<LoginForm />} />
        
        {/* Protected Routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <div className="flex bg-slate-50 min-h-screen">
              <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              
              {/* Mobile Menu Button */}
              <div className="fixed top-4 left-4 right-4 z-30 lg:left-auto lg:right-8 flex items-center justify-between lg:justify-end gap-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-lg bg-slate-900 text-white shadow-lg"
                >
                  <Menu size={24} />
                </button>
                
                <NotificationCenter />
              </div>

              <main className="flex-1 lg:ml-72 p-4 lg:p-8 pt-20 lg:pt-8">
                <Routes>
                  <Route path="/" element={<ModernDashboard />} />
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
                  <Route 
                    path="/apm" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <APMDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/errors" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <ErrorDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/agent-chat" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <AgentChatDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/agent-health" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <AgentHealthDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/database-health" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <DatabaseHealthPage />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/connectors" 
                    element={
                      <ProtectedRoute requiredRole="developer">
                        <ConnectorManagementPage />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/tenants" 
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <TenantManagementPage />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/backups" 
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <BackupManagementPage />
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/migrations" 
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <MigrationManagementPage />
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/search" element={<LeadSearch onSaveLead={handleSaveLead} savedLeadIds={savedLeads.map(l => l.id)} />} />
                  <Route path="/enhanced-search" element={<EnhancedLeadSearch onSaveLead={handleSaveLead} savedLeadIds={savedLeads.map(l => l.id)} />} />
                  <Route path="/proposals" element={<ProposalsPage />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </HashRouter>
  );
};

export default App;
