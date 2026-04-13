'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { authFetch } from '@/lib/utils';
import {
  Users, Key, Shield, Plus, Trash2, Edit3, Check, X,
  Loader2, Eye, EyeOff, ChevronDown, ChevronRight, Lock,
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

type Tab = 'users' | 'settings' | 'password';

export default function AdminPanel() {
  const { user, token } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add user state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [addUserMsg, setAddUserMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit user state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!isAdmin || !token) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/users', token);
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab, loadUsers]);

  // ===== User Management =====

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      setAddUserMsg({ type: 'error', text: 'All fields are required' });
      return;
    }
    if (!token) {
      setAddUserMsg({ type: 'error', text: 'Not authenticated. Please log in again.' });
      return;
    }
    try {
      const res = await authFetch('/api/users', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddUserMsg({ type: 'error', text: data.error || 'Failed to add user' });
        return;
      }
      setAddUserMsg({ type: 'success', text: 'User added successfully' });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setShowAddUser(false);
      loadUsers();
      setTimeout(() => setAddUserMsg(null), 3000);
    } catch (err) {
      setAddUserMsg({ type: 'error', text: 'Network error' });
    }
  };

  const handleEditUser = (u: UserItem) => {
    setEditingId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditPassword('');
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const body: Record<string, string> = { name: editName, email: editEmail };
      if (editRole) body.role = editRole;
      if (editPassword) body.password = editPassword;

      const res = await authFetch(`/api/users/${id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingId(null);
        loadUsers();
      }
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (deleteConfirm === id) {
      try {
        const res = await authFetch(`/api/users/${id}`, token, {
          method: 'DELETE',
        });
        if (res.ok) {
          loadUsers();
          setDeleteConfirm(null);
        }
      } catch (err) {
        console.error('Failed to delete user:', err);
      }
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // ===== Change Password =====

  const handleChangePassword = async () => {
    setPasswordMsg(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'All fields are required' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (!token) {
      setPasswordMsg({ type: 'error', text: 'Not authenticated. Please log in again.' });
      return;
    }
    try {
      const res = await authFetch('/api/auth/change-password', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordMsg({ type: 'error', text: data.error || 'Failed to change password' });
        return;
      }
      setPasswordMsg({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'error', text: 'Network error' });
    }
  };

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Admin Dashboard</h2>
        <p className="text-sm md:text-base text-slate-400">Manage users, AI settings, and your account.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'users' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Users size={16} />
            Users
          </button>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'settings' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Key size={16} />
          AI Settings
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'password' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Lock size={16} />
          Change Password
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">User Management</h3>
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
            >
              <Plus size={14} />
              Add User
            </button>
          </div>

          {addUserMsg && (
            <div className={`p-3 mb-4 rounded-lg text-sm ${addUserMsg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {addUserMsg.text}
            </div>
          )}

          {/* Add User Form */}
          {showAddUser && (
            <div className="p-4 mb-4 bg-slate-800 border border-blue-500/30 rounded-xl space-y-3">
              <h4 className="text-white font-medium text-sm">New User</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  placeholder="Password (min 6 chars)"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddUser(false)} className="px-3 py-1.5 text-slate-400 hover:text-white text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddUser} className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
                  Add User
                </button>
              </div>
            </div>
          )}

          {/* User List */}
          {loading ? (
            <div className="text-center py-8 text-slate-500">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              Loading users...
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors gap-3"
                >
                  {editingId === u.id ? (
                    <>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                          <input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="New pass"
                            className="px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 w-24"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleSaveEdit(u.id)} className="p-1.5 text-emerald-400 hover:text-emerald-300"><Check size={16} /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:text-white"><X size={16} /></button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium truncate text-sm">{u.name}</p>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                            {u.role}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleEditUser(u)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Edit user"
                        >
                          <Edit3 size={14} />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className={`p-1.5 rounded transition-all ${deleteConfirm === u.id ? 'text-red-400 bg-red-500/20' : 'text-slate-400 hover:text-red-400'}`}
                            title={deleteConfirm === u.id ? 'Click again to confirm' : 'Delete user'}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No users found</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Settings Tab */}
      {activeTab === 'settings' && <AISettingsPanel />}

      {/* Change Password Tab */}
      {activeTab === 'password' && (
        <div className="max-w-md">
          <h3 className="text-white font-semibold mb-4">Change Your Password</h3>
          {passwordMsg && (
            <div className={`p-3 mb-4 rounded-lg text-sm ${passwordMsg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {passwordMsg.text}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordMsg(null); }}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordMsg(null); }}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleChangePassword}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              <Lock size={16} />
              Change Password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== AI Settings Sub-Component =====

import { AI_PROVIDERS } from '@/lib/ai-providers';

function AISettingsPanel() {
  const { token } = useStore();
  const [settings, setSettings] = useState<Array<{ id: string; provider: string; api_key: string; model: string; is_active: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [provider, setProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('google/gemma-3-27b-it:free');
  const [makeActive, setMakeActive] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/settings', token);
      if (res.ok) {
        const data = await res.json();
        setSettings(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const prov = AI_PROVIDERS[provider];
    if (prov) setModel(prov.defaultModel);
  }, [provider]);

  const handleAddSetting = async () => {
    if (!apiKey.trim()) {
      setMsg({ type: 'error', text: 'API key is required' });
      return;
    }
    if (!token) {
      setMsg({ type: 'error', text: 'Not authenticated. Please log in again.' });
      return;
    }
    try {
      const res = await authFetch('/api/settings', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey, model, is_active: makeActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to save' });
        return;
      }
      setMsg({ type: 'success', text: 'AI provider saved successfully' });
      setApiKey('');
      setShowAdd(false);
      loadSettings();
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: 'Network error' });
    }
  };

  const handleActivate = async (id: string) => {
    if (!token) return;
    try {
      await authFetch('/api/settings', token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadSettings();
    } catch (err) {
      console.error('Failed to activate:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await authFetch('/api/settings', token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadSettings();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">AI Provider Settings</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-500/30 transition-colors"
        >
          <Plus size={14} />
          Add Provider
        </button>
      </div>

      {msg && (
        <div className={`p-3 mb-4 rounded-lg text-sm ${msg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Add Provider Form */}
      {showAdd && (
        <div className="p-4 mb-4 bg-slate-800 border border-blue-500/30 rounded-xl space-y-3">
          <h4 className="text-white font-medium text-sm">Add AI Provider</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {Object.entries(AI_PROVIDERS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.name}{p.free ? ' (Free Models Available)' : ''}
                  </option>
                ))}
              </select>
              {AI_PROVIDERS[provider]?.description && (
                <p className="text-[11px] text-slate-500 mt-1">{AI_PROVIDERS[provider].description}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {AI_PROVIDERS[provider]?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">API Key</label>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === 'openrouter' ? 'sk-or-v1-...' :
                provider === 'openai' ? 'sk-...' :
                provider === 'gemini' ? 'AIza...' :
                provider === 'claude' ? 'sk-ant-...' :
                provider === 'deepseek' ? 'sk-...' : 'API Key'
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
            {provider === 'openrouter' && (
              <p className="text-[11px] text-emerald-400/70 mt-1">
                Get a free API key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-300">openrouter.ai/keys</a> — free models work with $0 balance.
              </p>
            )}
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-slate-500 text-xs mt-1 hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              {showKey ? 'Hide' : 'Show'} key
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={makeActive}
              onChange={(e) => setMakeActive(e.target.checked)}
              className="rounded border-slate-600"
            />
            <label className="text-sm text-slate-300">Set as active provider</label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-slate-400 hover:text-white text-sm transition-colors">
              Cancel
            </button>
            <button onClick={handleAddSetting} className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Settings List */}
      {loading ? (
        <div className="text-center py-8 text-slate-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-2">
          {settings.map((s) => (
            <div
              key={s.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 rounded-xl transition-colors gap-3 ${
                s.is_active
                  ? 'bg-emerald-500/5 border border-emerald-500/30'
                  : 'bg-slate-800 border border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-medium text-sm">{AI_PROVIDERS[s.provider]?.name || s.provider}</p>
                  <span className="text-slate-500 text-xs">{s.model}</span>
                  {AI_PROVIDERS[s.provider]?.free && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded text-[10px] font-medium">Free Models</span>
                  )}
                  {s.is_active && (
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-medium">Active</span>
                  )}
                </div>
                <p className="text-slate-500 text-xs mt-0.5">{s.api_key}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!s.is_active && (
                  <button
                    onClick={() => handleActivate(s.id)}
                    className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs hover:bg-emerald-500/30 transition-colors"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {settings.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Key size={32} className="mx-auto mb-2 opacity-30" />
              <p>No AI providers configured</p>
              <p className="text-xs mt-1">Add an API key to enable AI features</p>
            </div>
          )}
        </div>
      )}

      {/* Provider info */}
      <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
        <h4 className="text-white font-medium text-sm mb-3">Supported Providers</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(AI_PROVIDERS).map(([key, p]) => (
            <div key={key} className="p-2 bg-slate-900 rounded-lg">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-medium">{p.name}</p>
                {p.free && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded text-[9px] font-semibold">FREE</span>
                )}
              </div>
              {p.description && (
                <p className="text-slate-400 text-[11px] mt-0.5">{p.description}</p>
              )}
              <p className="text-slate-500 text-xs mt-0.5">{p.models.length} models</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
