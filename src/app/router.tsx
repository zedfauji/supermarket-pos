import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelpSheet } from '@widgets/HelpSheet';
import { AgentButton, AgentPanel } from '@features/agent-chat';
import { ProtectedRoute } from './ProtectedRoute';
import { AuditRoute } from './audit-route';
import { EditHistoryRoute } from './edit-history-route';
import { PurchaseOrdersRoute } from './purchase-orders-route';
import { RbacRoute } from './rbac-route';
import { ReportsRoute } from './reports-route';

const LoginPage = lazy(() => import('../pages/login'));
const HomePage = lazy(() => import('../pages/home'));
const InventoryPage = lazy(() => import('../pages/inventory'));
const SuppliersPage = lazy(() => import('../pages/suppliers'));
const StaffPage = lazy(() => import('../pages/staff'));
const ReportsPage = lazy(() => import('../pages/reports'));
const SettingsPage = lazy(() => import('../pages/settings'));
const PaymentsPage = lazy(() => import('../pages/payments'));
const PosPage = lazy(() => import('../pages/pos'));
const RbacPage = lazy(() => import('../pages/rbac'));
const AuditPage = lazy(() => import('../pages/audit'));
const EditHistoryPage = lazy(() => import('../pages/edit-history'));
const PurchaseOrdersPage = lazy(() => import('../pages/purchase-orders'));

function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      <HelpSheet />
      <AgentButton />
      <AgentPanel />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute>
                <StaffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute>
                <SuppliersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsRoute>
                  <ReportsPage />
                </ReportsRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <PosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <PaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rbac"
            element={
              <ProtectedRoute>
                <RbacRoute>
                  <RbacPage />
                </RbacRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <AuditRoute>
                  <AuditPage />
                </AuditRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit-history"
            element={
              <ProtectedRoute>
                <EditHistoryRoute>
                  <EditHistoryPage />
                </EditHistoryRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <ProtectedRoute>
                <PurchaseOrdersRoute>
                  <PurchaseOrdersPage />
                </PurchaseOrdersRoute>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
