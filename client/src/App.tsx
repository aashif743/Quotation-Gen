import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CompanyProvider } from './context/CompanyContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import NewQuotation from './pages/NewQuotation';
import NewInvoice from './pages/NewInvoice';
import QuotationHistory from './pages/QuotationHistory';
import InvoiceHistory from './pages/InvoiceHistory';
import Settings from './pages/Settings';
import QuotationView from './pages/QuotationView';
import InvoiceView from './pages/InvoiceView';
import EditQuotation from './pages/EditQuotation';
import EditInvoice from './pages/EditInvoice';
import DeliveryNoteView from './pages/DeliveryNoteView';
import DeliveryNoteHistory from './pages/DeliveryNoteHistory';
import EditDeliveryNote from './pages/EditDeliveryNote';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import ClientStatementPage from './pages/ClientStatement';
import UserManagement from './pages/UserManagement';
import Login from './pages/Login';

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Public Route wrapper (redirects to dashboard if already logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Admin-only route wrapper (sends non-admins back to the dashboard)
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      {/* Self sign-up is disabled; admins create accounts. */}
      <Route path="/signup" element={<Navigate to="/login" replace />} />

      {/* Protected Routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <CompanyProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/new-quotation" element={<NewQuotation />} />
                  <Route path="/new-invoice" element={<NewInvoice />} />
                  <Route path="/history" element={<QuotationHistory />} />
                  <Route path="/invoice-history" element={<InvoiceHistory />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/quotation/:id" element={<QuotationView />} />
                  <Route path="/invoice/:id" element={<InvoiceView />} />
                  <Route path="/edit-quotation/:id" element={<EditQuotation />} />
                  <Route path="/edit-invoice/:id" element={<EditInvoice />} />
                  <Route path="/delivery-note/:id" element={<DeliveryNoteView />} />
                  <Route path="/delivery-history" element={<DeliveryNoteHistory />} />
                  <Route path="/edit-delivery-note/:id" element={<EditDeliveryNote />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/clients/:id" element={<ClientDetail />} />
                  <Route path="/clients/:id/statement" element={<ClientStatementPage />} />
                  <Route
                    path="/users"
                    element={
                      <AdminRoute>
                        <UserManagement />
                      </AdminRoute>
                    }
                  />
                </Routes>
              </Layout>
            </CompanyProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
