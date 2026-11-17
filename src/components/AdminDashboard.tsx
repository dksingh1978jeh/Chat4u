import React, { useEffect, useState } from 'react';
import {
  Users,
  MessageSquare,
  ShieldCheck,
  HardDrive,
  AlertTriangle,
  Bell,
  Settings,
  Lock,
  Search,
  RefreshCw,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [tab, setTab] = useState<
    'overview' | 'users' | 'reports' | 'notifications' | 'settings'
  >('overview');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [dailyActivity, setDailyActivity] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [userFilter, setUserFilter] = useState('');

  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, uList, rList, sData] = await Promise.all([
        apiRequest<{ metrics: any; dailyActivity: any[] }>('/api/admin/overview'),
        apiRequest<{ users: any[] }>('/api/admin/users'),
        apiRequest<{ reports: any[] }>('/api/admin/reports'),
        apiRequest<{ settings: Record<string, string> }>('/api/admin/settings'),
      ]);
      setMetrics(ov.metrics);
      setDailyActivity(ov.dailyActivity || []);
      setUsers(uList.users);
      setReports(rList.reports);
      setSettings(sData.settings);
    } catch (err: any) {
      setFeedback(err.message || 'Failed to load admin console');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const updateUser = async (id: number, patch: { status?: string; role?: string }) => {
    await apiRequest(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    loadAll();
  };

  const updateReport = async (id: number, status: string) => {
    await apiRequest(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadAll();
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    setFeedback('System settings saved');
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest<{ sentTo: number }>('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ title: notifTitle, body: notifBody }),
    });
    setNotifTitle('');
    setNotifBody('');
    setFeedback(`Broadcast sent to ${res.sentTo} active users.`);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredUsers = users.filter(
    (u) =>
      !userFilter.trim() ||
      (u.fullName || '').toLowerCase().includes(userFilter.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userFilter.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(userFilter.toLowerCase())
  );

  const maxDayCount = Math.max(1, ...dailyActivity.map((d) => Number(d.total || 0)));

  return (
    <div className="h-full bg-slate-50 dark:bg-[#0B141A] overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6 pb-16">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B21]"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                SmartConnect Admin Console
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Zero-knowledge privacy: End-to-end encrypted conversations are hidden
                  from administrators
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadAll}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B21] text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {feedback && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#111B21] rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {(
            [
              ['overview', 'Overview'],
              ['users', 'User Management'],
              ['reports', 'Reports'],
              ['notifications', 'Notifications'],
              ['settings', 'System Settings'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                tab === id
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#202C33]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {tab === 'overview' && metrics && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Total Registered Users</span>
                      <Users className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold mt-2 tabular-nums">
                      {metrics.totalUsers}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {metrics.activeUsers} active · {metrics.onlineUsers} online now
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Messages &amp; Groups</span>
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold mt-2 tabular-nums">
                      {metrics.totalMessages}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {metrics.totalGroups} groups · {metrics.totalCalls} calls
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Media Storage Used</span>
                      <HardDrive className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold mt-2 tabular-nums">
                      {formatBytes(metrics.storageBytes)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {metrics.totalStatuses} status updates
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Moderation Queue</span>
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </div>
                    <p className="text-2xl font-bold mt-2 tabular-nums">
                      {metrics.pendingReports}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Pending user reports</p>
                  </div>
                </div>

                {/* 7-day Message Volume Chart */}
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800 space-y-4">
                  <h3 className="text-sm font-semibold">
                    7-Day Aggregate Message Throughput (Counts Only)
                  </h3>
                  {dailyActivity.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6">
                      Message volume bars appear as messages are exchanged.
                    </p>
                  ) : (
                    <div className="flex items-end gap-3 h-40 pt-4">
                      {dailyActivity.map((d) => {
                        const pct = Math.max(
                          8,
                          Math.round((Number(d.total) / maxDayCount) * 100)
                        );
                        return (
                          <div
                            key={d.day}
                            className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                          >
                            <span className="text-[11px] font-mono tabular-nums text-slate-500">
                              {d.total}
                            </span>
                            <div
                              className="w-full max-w-[44px] rounded-t-lg bg-emerald-600 transition-all"
                              style={{ height: `${pct}%` }}
                            />
                            <span className="text-[10px] font-mono text-slate-400">
                              {String(d.day).slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'users' && (
              <div className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    placeholder="Filter users by name, username, or email..."
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-[#182229] text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">User</th>
                        <th className="px-4 py-3 font-medium">Contact</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {u.fullName || 'Unnamed'}
                            </p>
                            <p className="text-slate-500">@{u.username || 'user'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{u.email}</p>
                            <p className="text-slate-500 font-mono">
                              {u.mobileNumber || '—'}
                            </p>
                          </td>
                          <td className="px-4 py-3 capitalize">{u.role}</td>
                          <td className="px-4 py-3 capitalize">{u.status}</td>
                          <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                            {u.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => updateUser(u.id, { status: 'suspended' })}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateUser(u.id, { status: 'active' })}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                updateUser(u.id, {
                                  role: u.role === 'admin' ? 'user' : 'admin',
                                })
                              }
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
                            >
                              {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'reports' && (
              <div className="space-y-3">
                {reports.length === 0 ? (
                  <div className="p-10 text-center bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                    No user reports submitted.
                  </div>
                ) : (
                  reports.map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-sm">
                          {r.reason} ·{' '}
                          <span className="capitalize text-amber-600">{r.status}</span>
                        </p>
                        <p className="text-slate-500">
                          Reported: {r.reportedUser?.fullName} (@
                          {r.reportedUser?.username}) · By: {r.reporter?.fullName}
                        </p>
                        {r.details && <p className="text-slate-600 dark:text-slate-300">{r.details}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateReport(r.id, 'resolved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateReport(r.id, 'dismissed')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'notifications' && (
              <form
                onSubmit={sendBroadcast}
                className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-w-xl"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-600" />
                  <span>Send Global System Notification</span>
                </h3>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Announcement title"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
                />
                <textarea
                  rows={3}
                  required
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Write system alert for all active users..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Broadcast Alert
                </button>
              </form>
            )}

            {tab === 'settings' && (
              <form
                onSubmit={saveSettings}
                className="bg-white dark:bg-[#111B21] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-w-xl text-sm"
              >
                <h3 className="font-semibold flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" />
                  <span>System Settings</span>
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Max Attachment Size (MB)
                  </label>
                  <input
                    type="number"
                    value={settings.maxUploadMb || '25'}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, maxUploadMb: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Public Notice Banner
                  </label>
                  <input
                    type="text"
                    value={settings.globalNotice || ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, globalNotice: e.target.value }))
                    }
                    placeholder="Optional notice banner"
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33]"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={settings.allowRegistration !== 'false'}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        allowRegistration: String(e.target.checked),
                      }))
                    }
                    className="accent-emerald-600"
                  />
                  <span>Allow new user registrations</span>
                </label>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Save System Settings
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
