import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navigation.css';

const WebNavigation = () => {
  const { isAuthenticated, isEmailVerified } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated || !isEmailVerified) {
    return null;
  }

  const handleNavigate = (path) => {
    navigate(path);
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navItems = [
    { name: 'MeepleUps', path: '/events' },
    { name: 'Your Games', path: '/collection' },
    { name: 'Profile', path: '/profile' },
  ];

  return (
    <nav className="navigation">
      <div className="nav-content">
        <div className="nav-links">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={`nav-link ${isActive(item.path) ? 'nav-link-active' : ''}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default WebNavigation;

