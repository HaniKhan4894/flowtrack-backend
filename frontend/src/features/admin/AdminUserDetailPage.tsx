import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, LogOut, MailCheck, ShieldCheck, Trash2, UserCog, UserX } from 'lucide-react';
import { adminService } from '../../api/adminService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toastError, toastSuccess } from '../../store/toastStore';
import { beginImpersonation } from '../../utils/impersonation';
import type { AdminUserDetail } from '../../types/admin';
import { Avatar, Badge, Button, Card, PageSkeleton } from '../../components/ui';
import { ConfirmDialog, DataTable, KeyValueList, Panel } from './components/AdminUI';
import { formatDate, formatDateTime, formatNumber, formatRelative } from './components/format';

type Dialog = 'deactivate' | 'delete' | 'impersonate' | 'revoke' | null;

const AdminUserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(userId)) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminService.getUserDetail(userId);
      setDetail(response.data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load user'));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const quickAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toastSuccess(label);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Action failed'));
    }
  };

  const runDialog = async (reason: string) => {
    if (!dialog || !detail) return;
    setIsSubmitting(true);
    try {
      if (dialog === 'deactivate') {
        await adminService.setUserActive(userId, false);
        toastSuccess('User deactivated');
      } else if (dialog === 'revoke') {
        await adminService.revokeUserSessions(userId);
        toastSuccess('All sessions revoked');
      } else if (dialog === 'delete') {
        await adminService.deleteUser(userId, reason);
        toastSuccess('User deleted');
        navigate('/admin/users', { replace: true });
        return;
      } else {
        const response = await adminService.impersonate(userId, { reason });
        beginImpersonation(response.data);
        toastSuccess('Impersonation started');
        window.location.assign('/app');
        return;
      }
      setDialog(null);
      void load();
    } catch (e) {
      toastError(getApiErrorMessage(e, 'Action failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-300">{error ?? 'User not found'}</p>
        <Link to="/admin/users">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} className="mr-2" /> Back to users
          </Button>
        </Link>
      </div>
    );
  }

  const { user, activity } = detail;
  const activeSessions = detail.sessions.filter((s) => !s.revoked_at);

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        <ArrowLeft size={13} /> All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar name={user.name} src={user.avatar_url} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-white truncate">{user.name || user.email}</h2>
              {user.is_super_admin && <Badge variant="warning">Super admin</Badge>}
              {user.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Disabled</Badge>}
              {!user.is_verified && <Badge variant="warning">Unverified</Badge>}
              {user.two_factor_enabled && <Badge variant="info">2FA on</Badge>}
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {user.email} · joined {formatDate(user.created_at)} · {user.timezone ?? 'no timezone'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="text-amber-300" onClick={() => setDialog('impersonate')}>
            <UserCog size={14} className="mr-2" /> Login as user
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void quickAction('Password reset email sent', () => adminService.sendUserPasswordReset(userId))}
          >
            <KeyRound size={14} className="mr-2" /> Password reset
          </Button>
          {!user.is_verified && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void quickAction('Email verified', () => adminService.verifyUserEmail(userId))}
            >
              <MailCheck size={14} className="mr-2" /> Verify email
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void quickAction(
                user.is_super_admin ? 'Super-admin access revoked' : 'Super-admin access granted',
                () => adminService.setSuperAdmin(userId, !user.is_super_admin),
              )
            }
          >
            <ShieldCheck size={14} className="mr-2" />
            {user.is_super_admin ? 'Revoke super' : 'Make super'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog('revoke')}>
            <LogOut size={14} className="mr-2" /> Revoke sessions
          </Button>
          {user.is_active ? (
            <Button variant="secondary" size="sm" className="text-amber-300" onClick={() => setDialog('deactivate')}>
              <UserX size={14} className="mr-2" /> Deactivate
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="text-emerald-300"
              onClick={() => void quickAction('Account reactivated', () => adminService.setUserActive(userId, true))}
            >
              Reactivate
            </Button>
          )}
          <Button size="sm" className="bg-rose-500 hover:bg-rose-400 shadow-none" onClick={() => setDialog('delete')}>
            <Trash2 size={14} className="mr-2" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Hours all time', value: `${activity.total_hours}h` },
          { label: 'Hours 30d', value: `${activity.hours_30d}h` },
          { label: 'Time entries', value: formatNumber(activity.total_entries) },
          { label: 'Active sessions', value: formatNumber(activeSessions.length) },
        ].map((stat) => (
          <Card key={stat.label} className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="text-lg font-bold text-white mt-1">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Account" description="Identity and platform flags">
          <KeyValueList
            items={[
              { label: 'User ID', value: user.id },
              { label: 'UUID', value: <span className="font-mono text-xs">{user.uuid}</span> },
              { label: 'Global role', value: <Badge variant="primary">{user.role}</Badge> },
              { label: 'Two-factor', value: user.two_factor_enabled ? 'Enabled' : 'Disabled' },
              { label: 'Email verified', value: user.is_verified ? 'Yes' : 'No' },
              { label: 'Last activity', value: formatRelative(activity.last_activity_at) },
            ]}
          />
        </Panel>

        <Panel title={`Memberships (${detail.memberships.length})`} description="Organizations this user belongs to">
          <DataTable
            rows={detail.memberships}
            rowKey={(row) => row.organization_id}
            emptyMessage="Not a member of any organization."
            columns={[
              {
                key: 'org',
                header: 'Organization',
                render: (row) => (
                  <Link to={`/admin/organizations/${row.organization_id}`} className="text-white font-medium hover:text-primary-300">
                    {row.organization_name}
                  </Link>
                ),
              },
              { key: 'role', header: 'Role', render: (row) => <Badge variant="primary">{row.role_name ?? row.role}</Badge> },
              {
                key: 'status',
                header: 'Tenant',
                render: (row) =>
                  Number(row.organization_active) === 1 ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Suspended</Badge>,
              },
              { key: 'joined', header: 'Joined', align: 'right', render: (row) => formatDate(row.joined_at) },
            ]}
          />
        </Panel>

        <Panel title="Sessions" description="Refresh tokens issued to this account">
          <DataTable
            rows={detail.sessions}
            rowKey={(row) => row.id}
            emptyMessage="No sessions recorded."
            columns={[
              { key: 'device', header: 'Device', render: (row) => <span className="text-xs">{row.device_info ?? 'unknown'}</span> },
              { key: 'ip', header: 'IP', render: (row) => <span className="font-mono text-xs">{row.ip_address ?? '—'}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (row) =>
                  row.revoked_at ? (
                    <Badge variant="danger">Revoked</Badge>
                  ) : new Date(row.expires_at.replace(' ', 'T')) < new Date() ? (
                    <Badge>Expired</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  ),
              },
              { key: 'created', header: 'Created', align: 'right', render: (row) => formatDateTime(row.created_at) },
            ]}
          />
        </Panel>

        <Panel title="Impersonation history" description="Every time an admin logged in as this user">
          <DataTable
            rows={detail.impersonation_history}
            rowKey={(row) => row.id}
            emptyMessage="Never impersonated."
            columns={[
              { key: 'admin', header: 'Admin', render: (row) => row.admin_email ?? '—' },
              { key: 'reason', header: 'Reason', render: (row) => <span className="text-xs">{row.reason ?? '—'}</span> },
              { key: 'started', header: 'Started', align: 'right', render: (row) => formatDateTime(row.created_at) },
              {
                key: 'ended',
                header: 'Ended',
                align: 'right',
                render: (row) => (row.ended_at ? formatDateTime(row.ended_at) : <Badge variant="warning">Open</Badge>),
              },
            ]}
          />
        </Panel>
      </div>

      <ConfirmDialog
        open={dialog === 'impersonate'}
        title={`Log in as ${user.email}?`}
        description="You get a 30-minute session as this user. The action is audit-logged and you can return to your admin account from the banner."
        confirmLabel="Start session"
        requireReason
        isLoading={isSubmitting}
        onConfirm={runDialog}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'deactivate'}
        title={`Deactivate ${user.email}?`}
        description="The user is signed out everywhere and blocked from logging in until reactivated."
        confirmLabel="Deactivate"
        isLoading={isSubmitting}
        onConfirm={runDialog}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'revoke'}
        title="Revoke all sessions?"
        description="Every device is signed out. The user can log in again with their password."
        confirmLabel="Revoke sessions"
        isLoading={isSubmitting}
        onConfirm={runDialog}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${user.email}?`}
        description="Organization owners are soft-deleted so tenant data survives. Other users are removed completely."
        confirmLabel="Delete user"
        destructive
        requireReason
        isLoading={isSubmitting}
        onConfirm={runDialog}
        onClose={() => setDialog(null)}
      />
    </div>
  );
};

export default AdminUserDetailPage;
