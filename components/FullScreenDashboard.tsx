import React from 'react';
import ModernDashboard from './ModernDashboard';

const FullScreenDashboard: React.FC = () => {
  return (
    <div className="w-full h-screen overflow-hidden">
      <ModernDashboard />
    </div>
  );
};

export default FullScreenDashboard;