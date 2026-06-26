import React, { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { brandColorFor, hexToRgba } from '../../utils/colors';
import CompanySelector, { CompanyThumb } from './CompanySelector';
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
  Truck,
  Briefcase,
  Sun,
  Moon,
} from 'lucide-react';

// Banner-style header logo with cascading fallback so a broken/404 image
// never leaves a blank gap in the header:
//   1) admin-uploaded thumbnail (logo_url) — tried first
//   2) bundled brand logo (quote_logo_url) — fallback if (1) fails to load
//   3) round CompanyThumb (which falls back to initials) — final safety net
const HeaderLogo: React.FC<{ company: NonNullable<ReturnType<typeof useCompany>['selectedCompany']> }> = ({ company }) => {
  // 0 = uploaded thumbnail, 1 = bundled brand logo, 2 = thumb fallback.
  const [stage, setStage] = React.useState(0);
  // Reset to stage 0 whenever the company changes.
  React.useEffect(() => {
    setStage(0);
  }, [company.id]);

  const candidates = React.useMemo(
    () => [company.logo_url, company.quote_logo_url].filter(Boolean) as string[],
    [company.logo_url, company.quote_logo_url]
  );

  if (stage >= candidates.length) {
    return <CompanyThumb company={company} size="lg" />;
  }

  return (
    <img
      key={candidates[stage]}
      src={candidates[stage]}
      alt={`${company.name} logo`}
      className="object-contain max-h-14 w-auto"
      loading="eager"
      decoding="async"
      draggable={false}
      onError={() => setStage((s) => s + 1)}
    />
  );
};

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === 'dark';

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
  // Theme-aware version: in dark mode this is the brightened color used for
  // text / icons / borders that need to read against a dark surface. In
  // light mode it's identical to `primaryColor`.
  const accentColor = brandColorFor(primaryColor, isDark);
  // Tint alpha for soft brand backgrounds — bumped a touch in dark mode so
  // the company tint stays visible against the gray-800/900 surface without
  // overpowering the chrome (now that the accent color itself is properly
  // lifted by brandColorFor, the tints don't have to compensate as much).
  const tintBg     = hexToRgba(primaryColor, isDark ? 0.22 : 0.15);
  const tintGlow   = hexToRgba(primaryColor, isDark ? 0.12 : 0.05);
  const tintBorder = hexToRgba(accentColor,  isDark ? 0.28 : 0.20);

  const getNavItemClass = (path: string) => {
    const base = `flex items-center ${collapsed ? 'justify-center px-0' : 'space-x-3 px-4'} py-3 rounded-lg transition-colors`;
    const isActive = location.pathname === path;
    return isActive
      ? base
      : `${base} text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`;
  };

  const getNavItemStyle = (path: string): React.CSSProperties => {
    const isActive = location.pathname === path;
    if (!isActive || !selectedCompany) return {};
    // Use the brightened accent for the text + border so dark brand colors
    // (navy, deep maroon, …) stay legible against the dark tinted background.
    return {
      backgroundColor: tintBg,
      color: accentColor,
      borderLeft: collapsed ? undefined : `4px solid ${accentColor}`,
    };
  };

  const getSidebarStyle = (): React.CSSProperties => {
    if (!selectedCompany) return {};
    const baseColor = isDark ? '#1f2937' /* gray-800 */ : '#ffffff';
    return {
      background: `linear-gradient(to right, ${tintGlow}, ${baseColor})`,
      borderColor: tintBorder,
    };
  };

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/new-quotation', icon: FileText, label: 'New Quotation' },
    { to: '/new-invoice', icon: Receipt, label: 'New Invoice' },
    { to: '/history', icon: History, label: 'Quotation History' },
    { to: '/invoice-history', icon: Receipt, label: 'Invoice History' },
    { to: '/delivery-history', icon: Truck, label: 'Delivery Notes' },
    { to: '/clients', icon: Briefcase, label: 'Clients' },
    ...(isAdmin
      ? [
          { to: '/users', icon: Users, label: 'User Management' },
          { to: '/settings', icon: Settings, label: 'Company Settings' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors">
      <div className="flex">
        <div
          className={`${collapsed ? 'w-20' : 'w-64'} sticky top-0 h-screen self-start shrink-0 border-r shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700 transition-all duration-300 no-print`}
          style={getSidebarStyle()}
        >
          <div className={`flex flex-col h-full ${collapsed ? 'p-3' : 'p-6'}`}>
            {/* Brand + collapse toggle */}
            <div className={`flex items-center mb-8 ${collapsed ? 'justify-center' : 'justify-between'}`}>
              {!collapsed && (
                <div className="flex items-center space-x-3 min-w-0">
                  <Building2 className="h-8 w-8 flex-shrink-0" style={{ color: accentColor }} />
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">Quotation System</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">Multi-Company Platform</p>
                  </div>
                </div>
              )}
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
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
            <div className="mt-auto pt-4 border-t" style={{ borderColor: tintBorder }}>
              {collapsed ? (
                <div
                  className="mb-2 flex justify-center"
                  title={`${user?.name} (${user?.role})`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: tintBg }}
                  >
                    <User className="h-4 w-4" style={{ color: accentColor }} />
                  </div>
                </div>
              ) : (
                <div className="mb-2 flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/60">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: tintBg }}
                  >
                    <User className="h-4 w-4" style={{ color: accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={user?.name}>
                        {user?.name}
                      </p>
                      <span
                        className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          isAdmin
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-200'
                        }`}
                      >
                        {isAdmin && <ShieldCheck className="h-3 w-3 mr-0.5" />}
                        {user?.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={user?.email}>
                      {user?.email}
                    </p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className={`flex items-center ${collapsed ? 'justify-center px-0' : 'space-x-3 px-3'} py-2.5 rounded-lg transition-colors text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400 w-full`}
                title={collapsed ? 'Sign Out' : undefined}
              >
                <LogOut className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 no-print transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {selectedCompany?.name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {selectedCompany?.address}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={toggleTheme}
                  className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark
                    ? <Sun className="h-5 w-5 text-amber-400" />
                    : <Moon className="h-5 w-5 text-slate-700" />}
                </button>
                {selectedCompany && <HeaderLogo company={selectedCompany} />}
              </div>
            </div>
          </header>

          <main className="p-6 text-gray-900 dark:text-gray-100 transition-colors">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
