import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '@entities/staff/model/usePermissions';

type AuditRouteProps = {
  children: ReactNode;
};

export function AuditRoute({ children }: AuditRouteProps) {
  const { can } = usePermissions();
  if (!can('view_audit_log')) {
    toast.error('This page is restricted to managers and admins.');
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
