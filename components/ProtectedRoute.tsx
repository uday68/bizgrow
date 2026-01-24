import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import LoginForm from './LoginForm';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'developer' | 'admin';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole = 'user' 
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuthentication();
  }, [requiredRole]);

  const checkAuthentication = async () => {
    try {
      // Check if user is authenticated
      const authenticated = apiService.isAuthenticated();
      setIsAuthenticated(authenticated);

      if (authenticated) {
        // Get user info
        const currentUser = apiService.getUser();
        setUser(currentUser);

        // Check role permissions
        const hasRole = apiService.hasRole(requiredRole);
        setHasPermission(hasRole);

        // Verify token is still valid by making a request
        try {
          await apiService.getCurrentUser();
        } catch (error) {
          // Token is invalid, clear auth state
          setIsAuthenticated(false);
          setHasPermission(false);
          setUser(null);
        }
      } else {
        setHasPermission(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Authentication check failed:', error);
      setIsAuthenticated(false);
      setHasPermission(false);
      setUser(null);
    }
  };

  const handleLoginSuccess = () => {
    checkAuthentication();
  };

  // Loading state
  if (isAuthenticated === null || hasPermission === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <span className="ml-4 text-white text-lg">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  // Authenticated but insufficient permissions
  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="absolute inset-0 bg-black/20"></div>
        
        <div className="relative z-10 w-full max-w-md">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
              <p className="text-white/70 mb-4">
                You need <span className="font-semibold text-white">{requiredRole}</span> role to access this page.
              </p>
              <p className="text-white/60 text-sm">
                Current role: <span className="font-semibold">{user?.role || 'Unknown'}</span>
              </p>
            </div>

            <button
              onClick={() => {
                apiService.logout();
                setIsAuthenticated(false);
                setHasPermission(false);
                setUser(null);
              }}
              className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated and has permission
  return <>{children}</>;
};

export default ProtectedRoute;