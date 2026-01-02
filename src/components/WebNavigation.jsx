import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GearIcon from './GearIcon';
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
    { name: 'Profile', path: '/profile', showGear: true },
  ];

  return (
    <nav className="navigation" role="navigation" aria-label="Main navigation">
      <div className="nav-content">
        <ul className="nav-links">
          {navItems.map((item) => (
            <li key={item.path}>
              <button
                onClick={() => handleNavigate(item.path)}
                className={`nav-link ${isActive(item.path) ? 'nav-link-active' : ''}`}
                aria-current={isActive(item.path) ? 'page' : undefined}
              >
                <span className="nav-link-content">
                  {item.name}
                  {item.showGear && (
                    <>
                      {' / '}
                      <span className="gear-icon-wrapper" aria-hidden="true">
                        <GearIcon
                          size={isActive(item.path) ? 18 : 14}
                          color={isActive(item.path) ? 'var(--meeple-red)' : 'var(--text-secondary)'}
                        />
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default WebNavigation;

