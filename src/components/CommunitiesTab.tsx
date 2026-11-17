import React, { useEffect, useState, useRef } from 'react';
import {
  Users,
  Plus,
  Shield,
  Megaphone,
  UserPlus,
  UserMinus,
  MessageCircle,
  X,
  Camera,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest, uploadMediaFile } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { Avatar } from './Avatar.tsx';
import type { GroupInfo } from '../types/index.ts';

interface CommunitiesTabProps {
  onOpenGroupConversation: (conversationId: number) => void;
}

export const CommunitiesTab: React.FC<CommunitiesTabProps> = ({
  onOpenGroupConversation,
}) => {
  const { user, language } = useAuth();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [isAnnouncementOnly, setIsAnnouncementOnly] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const [managingGroup, setManagingGroup] = useState<GroupInfo | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ groups: GroupInfo[] }>('/api/groups');
      setGroups(data.groups);
      if (managingGroup) {
        const refreshed = data.groups.find((g) => g.id === managingGroup.id) || null;
        setManagingGroup(refreshed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const openCreateModal = async () => {
    setShowCreate(true);
    try {
      const data = await apiRequest<{ users: any[] }>('/api/users/search?q=');
      setAvailableUsers(data.users);
    } catch {
      setAvailableUsers([]);
    }
  };

  const handleGroupPhoto = async (file: File) => {
    const up = await uploadMediaFile(file);
    setAvatarUrl(up.fileUrl);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await apiRequest('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          communityName: communityName || null,
          isAnnouncementOnly,
          avatarUrl,
          memberIds: selectedMemberIds,
        }),
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      setCommunityName('');
      setAvatarUrl(null);
      setSelectedMemberIds([]);
      loadGroups();
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAnnouncement = async (g: GroupInfo) => {
    await apiRequest(`/api/groups/${g.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAnnouncementOnly: !g.isAnnouncementOnly }),
    });
    loadGroups();
  };

  const handleToggleMemberRole = async (
    g: GroupInfo,
    targetUserId: number,
    currentRole: string
  ) => {
    await apiRequest(`/api/groups/${g.id}/members/${targetUserId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: currentRole === 'admin' ? 'member' : 'admin' }),
    });
    loadGroups();
  };

  const handleRemoveMember = async (g: GroupInfo, targetUserId: number) => {
    await apiRequest(`/api/groups/${g.id}/members/${targetUserId}`, {
      method: 'DELETE',
    });
    loadGroups();
  };

  const handleAddMember = async (g: GroupInfo, targetUserId: number) => {
    await apiRequest(`/api/groups/${g.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: targetUserId }),
    });
    loadGroups();
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111B21] overflow-y-auto">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t(language, 'communitiesTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Groups, announcements, polls &amp; shared communities
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{t(language, 'createGroup')}</span>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No groups or communities yet
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium"
            >
              Create Your First Group
            </button>
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <Avatar src={g.avatarUrl} name={g.name} size="lg" isGroup />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                      {g.name}
                    </h3>
                    {g.communityName && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        · {g.communityName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {g.description || 'SmartConnect group conversation'}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{g.members?.length || 0} members</span>
                    {g.isAnnouncementOnly && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Megaphone className="w-3 h-3" /> Admins only
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const data = await apiRequest<{ users: any[] }>('/api/users/search?q=');
                    setAvailableUsers(data.users);
                    setManagingGroup(g);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-[#202C33]"
                >
                  Manage
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGroupConversation(g.conversationId)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Open Chat</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Group Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-3.5 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Create New Group</h3>
              <button type="button" onClick={() => setShowCreate(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="w-14 h-14 rounded-full bg-slate-100 dark:bg-[#202C33] flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-5 h-5 text-slate-400" />
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleGroupPhoto(f);
                }}
              />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
              />
            </div>

            <input
              type="text"
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
              placeholder="Community name (optional, e.g. Neighborhood)"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            />

            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Group description"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#202C33] text-sm"
            />

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnnouncementOnly}
                onChange={(e) => setIsAnnouncementOnly(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>Announcement mode (only admins can send messages)</span>
            </label>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Add Members</p>
              <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1">
                {availableUsers.map((u) => {
                  const checked = selectedMemberIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#202C33] text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedMemberIds((prev) =>
                            checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          )
                        }
                        className="accent-emerald-600"
                      />
                      <span className="font-medium">{u.fullName}</span>
                      <span className="text-slate-400">@{u.username}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      )}

      {/* Manage Group Modal */}
      {managingGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111B21] rounded-2xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{managingGroup.name} · Settings</h3>
              <button type="button" onClick={() => setManagingGroup(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {managingGroup.members?.find((m) => m.userId === user?.id)?.role ===
              'admin' && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202C33] flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <Megaphone className="w-4 h-4 text-emerald-600" />
                  Admin-only messaging
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleAnnouncement(managingGroup)}
                  className={`px-3 py-1 rounded-lg font-medium ${
                    managingGroup.isAnnouncementOnly
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  {managingGroup.isAnnouncementOnly ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Members</p>
              {managingGroup.members?.map((m) => {
                const amAdmin =
                  managingGroup.members?.find((x) => x.userId === user?.id)?.role ===
                  'admin';
                return (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#202C33]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={m.avatarUrl} name={m.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{m.fullName}</p>
                        <p className="text-[11px] text-slate-500">
                          @{m.username} · {m.role}
                        </p>
                      </div>
                    </div>
                    {amAdmin && m.userId !== user?.id && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Toggle Admin"
                          onClick={() =>
                            handleToggleMemberRole(managingGroup, m.userId, m.role)
                          }
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-600"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Remove Member"
                          onClick={() => handleRemoveMember(managingGroup, m.userId)}
                          className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-500"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {managingGroup.members?.find((m) => m.userId === user?.id)?.role ===
              'admin' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Add More Users</p>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {availableUsers
                    .filter(
                      (u) => !managingGroup.members?.some((m) => m.userId === u.id)
                    )
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
                      >
                        <span>
                          {u.fullName} (@{u.username})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddMember(managingGroup, u.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
