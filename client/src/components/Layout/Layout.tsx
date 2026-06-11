import React, { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import CompanySelector from './CompanySelector';
import {
  Home,
  FileText,
  History,
  Settings,
  Building2,
  Receipt,
  LogOut,
  User,
  Users,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  HardDrive,
  Truck,
  Briefcase,
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { user, logout, isAdmin } = useAuth();

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Get the primary color from the selected company or use default
  const primaryColor = selectedCompany?.primary_color || '#4f46e5';

  // Helper to convert hex to rgba for backgrounds
  const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(79, 70, 229, ${alpha})`;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
  };

  const getNavItemClass = (path: string) => {
    const base = `flex items-center ${collapsed ? 'justify-center px-0' : 'space-x-3 px-4'} py-3 rounded-lg transition-colors`;
    const isActive = location.pathname === path;
    return isActive ? base : `${base} text-gray-600 hover:bg-gray-100`;
  };

  const getNavItemStyle = (path: string): React.CSSProperties => {
    const isActive = location.pathname === path;
    if (!isActive || !selectedCompany) return {};
    return {
      backgroundColor: hexToRgba(primaryColor, 0.15),
      color: primaryColor,
      borderLeft: collapsed ? undefined : `4px solid ${primaryColor}`,
    };
  };

  const getSidebarStyle = (): React.CSSProperties => {
    if (!selectedCompany) return {};
    return {
      background: `linear-gradient(to right, ${hexToRgba(primaryColor, 0.05)}, white)`,
      borderColor: hexToRgba(primaryColor, 0.2),
    };
  };

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/new-quotation', icon: FileText, label: 'New Quotation' },
    { to: '/history', icon: History, label: 'Quotation History' },
    { to: '/invoice-history', icon: Receipt, label: 'Invoice History' },
    { to: '/delivery-history', icon: Truck, label: 'Delivery Notes' },
    { to: '/clients', icon: Briefcase, label: 'Clients' },
    ...(isAdmin
      ? [
          { to: '/users', icon: Users, label: 'User Management' },
          { to: '/storage', icon: HardDrive, label: 'Storage Usage' },
          { to: '/settings', icon: Settings, label: 'Company Settings' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        <div
          className={`${collapsed ? 'w-20' : 'w-64'} sticky top-0 h-screen self-start shrink-0 border-r shadow-sm bg-white transition-all duration-300`}
          style={getSidebarStyle()}
        >
          <div className={`flex flex-col h-full ${collapsed ? 'p-3' : 'p-6'}`}>
            {/* Brand + collapse toggle */}
            <div className={`flex items-center mb-8 ${collapsed ? 'justify-center' : 'justify-between'}`}>
              {!collapsed && (
                <div className="flex items-center space-x-3 min-w-0">
                  <Building2 className="h-8 w-8 flex-shrink-0" style={{ color: primaryColor }} />
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 truncate">Quotation System</h1>
                    <p className="text-sm text-gray-600 truncate">Multi-Company Platform</p>
                  </div>
                </div>
              )}
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </button>
            </div>

            <CompanySelector collapsed={collapsed} />

            {/* The nav is the only scrollable area so the brand stays at the
                top and the user/logout block stays at the bottom even on
                short viewports. `min-h-0` is required for `overflow-y-auto`
                to actually engage inside a flex column. */}
            <nav className="mt-8 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 -mr-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={getNavItemClass(to)}
                  style={getNavItemStyle(to)}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              ))}
            </nav>

            {/* User Info & Logout — pinned to bottom of the sidebar via mt-auto */}
            <div className="mt-auto pt-4 border-t" style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
              {collapsed ? (
                <div
                  className="mb-2 flex justify-center"
                  title={`${user?.name} (${user?.role})`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: hexToRgba(primaryColor, 0.15) }}
                  >
                    <User className="h-4 w-4" style={{ color: primaryColor }} />
                  </div>
                </div>
              ) : (
                <div className="mb-2 flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-gray-50">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: hexToRgba(primaryColor, 0.15) }}
                  >
                    <User className="h-4 w-4" style={{ color: primaryColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={user?.name}>
                        {user?.name}
                      </p>
                      <span
                        className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {isAdmin && <ShieldCheck className="h-3 w-3 mr-0.5" />}
                        {user?.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate" title={user?.email}>
                      {user?.email}
                    </p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className={`flex items-center ${collapsed ? 'justify-center px-0' : 'space-x-3 px-3'} py-2.5 rounded-lg transition-colors text-gray-600 hover:bg-red-50 hover:text-red-600 w-full`}
                title={collapsed ? 'Sign Out' : undefined}
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  {selectedCompany?.name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-600">
                  {selectedCompany?.address}
                </p>
              </div>
              {/* Header shows the real logo (banner-style, not a cropped
                  thumbnail) — falls back to the bundled brand logo when
                  no thumbnail has been uploaded. */}
              {selectedCompany && (selectedCompany.logo_url || selectedCompany.quote_logo_url) && (
                <img
                  src={selectedCompany.logo_url || selectedCompany.quote_logo_url}
                  alt={`${selectedCompany.name} logo`}
                  className="object-contain max-h-14 w-auto"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              )}
            </div>
          </header>

          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
