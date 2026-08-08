'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TextInput, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
}

interface AppUser {
  id: string;
  fullName: string;
  username: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  role: Role;
}

interface RolePermission {
  module: string;
  action: string;
}

type CreateFormState = { fullName: string; username: string; password: string; roleId: string };
type EditFormState = { fullName: string; roleId: string };

const emptyCreateForm: CreateFormState = { fullName: '', username: '', password: '', roleId: '' };
const emptyEditForm: EditFormState = { fullName: '', roleId: '' };

export default function UsersPage() {
  const { user: currentUser, can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm);
  const [editing, setEditing] = useState(false);

  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [rolePermsLoading, setRolePermsLoading] = useState(false);

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  function loadUsers() {
    setLoading(true);
    setError(null);
    apiInvoke<AppUser[]>('users:list')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
    apiInvoke<Role[]>('roles:list').then(setRoles).catch(() => undefined);
  }, []);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiInvoke('users:create', {
        fullName: createForm.fullName,
        username: createForm.username,
        password: createForm.password,
        roleId: createForm.roleId,
      });
      notify('تمت إضافة المستخدم بنجاح', 'success');
      setCreateOpen(false);
      loadUsers();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إضافة المستخدم', 'error');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(u: AppUser) {
    setEditingUser(u);
    setEditForm({ fullName: u.fullName, roleId: u.roleId });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditing(true);
    try {
      await apiInvoke('users:update', { id: editingUser.id, fullName: editForm.fullName, roleId: editForm.roleId });
      notify('تم تحديث بيانات المستخدم', 'success');
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تحديث بيانات المستخدم', 'error');
    } finally {
      setEditing(false);
    }
  }

  async function handleToggleActive(u: AppUser) {
    if (u.isActive) {
      const ok = await confirm({
        title: 'تعطيل المستخدم',
        message: `هل أنت متأكد من تعطيل المستخدم "${u.fullName}"؟ لن يتمكن من تسجيل الدخول بعد التعطيل.`,
        danger: true,
        confirmLabel: 'تعطيل',
      });
      if (!ok) return;
    }
    try {
      await apiInvoke('users:setActive', { id: u.id, isActive: !u.isActive });
      notify(u.isActive ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم', 'success');
      loadUsers();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openReset(u: AppUser) {
    setResetUser(u);
    setResetPassword('');
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    const ok = await confirm({
      title: 'إعادة تعيين كلمة المرور',
      message: `سيتم تعيين كلمة مرور جديدة للمستخدم "${resetUser.fullName}".`,
      confirmLabel: 'تأكيد',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await apiInvoke('users:resetPassword', { id: resetUser.id, newPassword: resetPassword });
      notify('تمت إعادة تعيين كلمة المرور', 'success');
      setResetUser(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إعادة تعيين كلمة المرور', 'error');
    } finally {
      setResetting(false);
    }
  }

  async function toggleRoleExpand(roleId: string) {
    if (expandedRoleId === roleId) {
      setExpandedRoleId(null);
      return;
    }
    setExpandedRoleId(roleId);
    setRolePermsLoading(true);
    try {
      const perms = await apiInvoke<RolePermission[]>('roles:permissions', { roleId });
      setRolePermissions(perms);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تحميل صلاحيات الدور', 'error');
    } finally {
      setRolePermsLoading(false);
    }
  }

  const columns: Column<AppUser>[] = [
    { key: 'fullName', header: 'الاسم الكامل' },
    { key: 'username', header: 'اسم المستخدم' },
    { key: 'role', header: 'الدور', render: (r) => r.role?.name ?? '—' },
    {
      key: 'isActive', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.isActive ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500')}>
          {r.isActive ? 'نشط' : 'معطل'}
        </span>
      ),
    },
    {
      key: 'lastLoginAt', header: 'آخر تسجيل دخول',
      render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('ar-JO') : 'لم يسجل دخول بعد'),
    },
  ];

  const permsByModule = rolePermissions.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p.action);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المستخدمون والصلاحيات</h1>
        {can('users', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مستخدم
          </button>
        )}
      </div>

      <div className="card mb-6">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadUsers}
          emptyTitle="لا يوجد مستخدمون مسجلون بعد"
          actions={(row) =>
            can('users', 'update') ? (
              <div className="flex gap-2">
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openReset(row); }}>
                  إعادة تعيين كلمة المرور
                </button>
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}>
                  {row.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
              </div>
            ) : null
          }
        />
      </div>

      <div className="card mb-6 p-4">
        <h2 className="mb-3 font-bold">الأدوار والصلاحيات</h2>
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="rounded border border-gray-100">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-right text-sm"
                onClick={() => toggleRoleExpand(role.id)}
              >
                <span className="font-medium">{role.name}</span>
                <span className="text-xs text-gray-400">{expandedRoleId === role.id ? '▲' : '▼'}</span>
              </button>
              {expandedRoleId === role.id && (
                <div className="border-t border-gray-100 p-3">
                  {rolePermsLoading ? (
                    <p className="text-sm text-gray-500">جارٍ التحميل...</p>
                  ) : Object.keys(permsByModule).length === 0 ? (
                    <p className="text-sm text-gray-500">لا توجد صلاحيات لهذا الدور</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(permsByModule).map(([module, actions]) => (
                        <div key={module} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-gray-500">{module}</span>
                          {actions.map((action) => (
                            <span key={action} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {action}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {currentUser && <ChangePasswordCard userId={currentUser.id} />}

      {createOpen && (
        <CreateUserModal
          form={createForm}
          setForm={setCreateForm}
          roleOptions={roleOptions}
          onSubmit={handleCreate}
          onClose={() => setCreateOpen(false)}
          saving={creating}
        />
      )}

      {editingUser && (
        <EditUserModal
          form={editForm}
          setForm={setEditForm}
          roleOptions={roleOptions}
          onSubmit={handleEdit}
          onClose={() => setEditingUser(null)}
          saving={editing}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          userName={resetUser.fullName}
          password={resetPassword}
          setPassword={setResetPassword}
          onSubmit={handleReset}
          onClose={() => setResetUser(null)}
          saving={resetting}
        />
      )}
    </AppShell>
  );
}

function CreateUserModal({
  form, setForm, roleOptions, onSubmit, onClose, saving,
}: {
  form: CreateFormState;
  setForm: (f: CreateFormState) => void;
  roleOptions: { value: string; label: string }[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-bold">إضافة مستخدم جديد</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="الاسم الكامل" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <div>
            <TextInput
              label="اسم المستخدم"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-400">يُسمح بالحروف الإنجليزية والأرقام والشرطة السفلية والنقطة فقط</p>
          </div>
          <TextInput
            label="كلمة المرور"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select label="الدور" required placeholder="اختر الدور" options={roleOptions} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  form, setForm, roleOptions, onSubmit, onClose, saving,
}: {
  form: EditFormState;
  setForm: (f: EditFormState) => void;
  roleOptions: { value: string; label: string }[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-bold">تعديل بيانات المستخدم</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="الاسم الكامل" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Select label="الدور" required placeholder="اختر الدور" options={roleOptions} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  userName, password, setPassword, onSubmit, onClose, saving,
}: {
  userName: string;
  password: string;
  setPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-sm p-6">
        <h2 className="mb-4 text-lg font-bold">إعادة تعيين كلمة مرور {userName}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput
            label="كلمة المرور الجديدة"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangePasswordCard({ userId }: { userId: string }) {
  const { notify } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      notify('كلمة المرور الجديدة وتأكيدها غير متطابقين', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiInvoke('auth:changePassword', { currentPassword, newPassword });
      notify('تم تغيير كلمة المرور بنجاح', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تغيير كلمة المرور', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4" key={userId}>
      <h2 className="mb-3 font-bold">تغيير كلمة المرور</h2>
      <form onSubmit={handleSubmit} className="grid max-w-lg gap-4">
        <TextInput
          label="كلمة المرور الحالية"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <TextInput
          label="كلمة المرور الجديدة"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <TextInput
          label="تأكيد كلمة المرور الجديدة"
          type="password"
          required
          minLength={8}
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'تغيير كلمة المرور'}</button>
        </div>
      </form>
    </div>
  );
}
