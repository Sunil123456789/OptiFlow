import { useEffect, useState } from "react";

import { Modal } from "../../../components/Modal";
import { createRole, createUser, deleteRole, deleteUser, fetchRoles, fetchUsers, updateRole, updateUser } from "../../../lib/api";
import { canManageUsers } from "../../../lib/permissions";
import type { AuthUser, RoleDefinition, RolePermissions, UserRecord } from "../../../lib/types";

function toLabel(value: string): string {
  return value.replace("_", " ");
}

type UsersPageProps = {
  currentUser: AuthUser;
};

export function UsersPage({ currentUser }: UsersPageProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRoleCreateForm, setShowRoleCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [isActive, setIsActive] = useState(true);

  const [roleName, setRoleName] = useState("");
  const [roleIsActive, setRoleIsActive] = useState(true);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    can_manage_users: false,
    can_manage_assets: false,
    can_create_work_orders: false,
    can_update_work_orders: false,
    can_import_master_data: false,
  });

  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("viewer");
  const [editIsActive, setEditIsActive] = useState(true);

  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [editRoleIsActive, setEditRoleIsActive] = useState(true);
  const [editRolePermissions, setEditRolePermissions] = useState<RolePermissions>({
    can_manage_users: false,
    can_manage_assets: false,
    can_create_work_orders: false,
    can_update_work_orders: false,
    can_import_master_data: false,
  });

  function roleOptions(): string[] {
    return roles.map((item) => item.name);
  }

  function permissionCheckbox(
    label: string,
    key: keyof RolePermissions,
    current: RolePermissions,
    setCurrent: (next: RolePermissions) => void,
    disabled = false
  ) {
    return (
      <label>
        <input
          type="checkbox"
          checked={current[key]}
          disabled={disabled}
          onChange={(event) => setCurrent({ ...current, [key]: event.target.checked })}
        />
        {label}
      </label>
    );
  }

  async function loadData() {
    try {
      setIsLoading(true);
      const [usersData, rolesData] = await Promise.all([fetchUsers(), fetchRoles()]);
      setUsers(usersData);
      setRoles(rolesData);
      if (rolesData.length > 0) {
        if (!rolesData.some((item) => item.name === role)) {
          setRole(rolesData[0].name);
        }
        if (!rolesData.some((item) => item.name === editRole)) {
          setEditRole(rolesData[0].name);
        }
      }
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load users.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateUser() {
    try {
      setIsCreating(true);
      await createUser({
        full_name: fullName.trim(),
        email: email.trim(),
        password: password,
        role,
        is_active: isActive,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      if (roles.length > 0) {
        setRole(roles[0].name);
      }
      setIsActive(true);
      setShowCreateForm(false);
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create user.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  function openEditModal(user: UserRecord) {
    setEditingUser(user);
    setEditFullName(user.full_name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditIsActive(user.is_active);
    setEditPassword("");
  }

  function closeEditModal() {
    setEditingUser(null);
    setEditFullName("");
    setEditEmail("");
    setEditPassword("");
    setEditRole(roles.length > 0 ? roles[0].name : "viewer");
    setEditIsActive(true);
  }

  async function handleSaveEdit() {
    if (!editingUser || !editFullName.trim() || !editEmail.trim()) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateUser(editingUser.id, {
        full_name: editFullName.trim(),
        email: editEmail.trim(),
        role: editRole,
        is_active: editIsActive,
        ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
      });
      closeEditModal();
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update user.");
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleCreateRole() {
    try {
      setIsCreatingRole(true);
      await createRole({
        name: roleName.trim().toLowerCase(),
        is_active: roleIsActive,
        permissions: rolePermissions,
      });
      setRoleName("");
      setRoleIsActive(true);
      setRolePermissions({
        can_manage_users: false,
        can_manage_assets: false,
        can_create_work_orders: false,
        can_update_work_orders: false,
        can_import_master_data: false,
      });
      setShowRoleCreateForm(false);
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create role.");
      }
    } finally {
      setIsCreatingRole(false);
    }
  }

  function openRoleEditModal(roleItem: RoleDefinition) {
    setEditingRole(roleItem);
    setEditRoleIsActive(roleItem.is_active);
    setEditRolePermissions(roleItem.permissions);
  }

  function closeRoleEditModal() {
    setEditingRole(null);
    setEditRoleIsActive(true);
    setEditRolePermissions({
      can_manage_users: false,
      can_manage_assets: false,
      can_create_work_orders: false,
      can_update_work_orders: false,
      can_import_master_data: false,
    });
  }

  async function handleSaveRoleEdit() {
    if (!editingRole) {
      return;
    }

    try {
      setIsSavingRole(true);
      await updateRole(editingRole.name, {
        permissions: editRolePermissions,
        is_active: editRoleIsActive,
      });
      closeRoleEditModal();
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update role.");
      }
    } finally {
      setIsSavingRole(false);
    }
  }

  async function handleToggleUserActive(target: UserRecord) {
    if (target.id === currentUser.id && target.is_active) {
      setError("You cannot disable your own account.");
      return;
    }

    try {
      await updateUser(target.id, { is_active: !target.is_active });
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update user status.");
      }
    }
  }

  async function handleToggleRoleActive(roleItem: RoleDefinition) {
    try {
      await updateRole(roleItem.name, { is_active: !roleItem.is_active });
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update role status.");
      }
    }
  }

  async function handleDeleteRole(roleItem: RoleDefinition) {
    const approved = window.confirm(`Delete role ${roleItem.name}?`);
    if (!approved) {
      return;
    }

    try {
      await deleteRole(roleItem.name);
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete role.");
      }
    }
  }

  async function handleDelete(target: UserRecord) {
    if (target.id === currentUser.id) {
      setError("You cannot delete your own account.");
      return;
    }

    const approved = window.confirm(`Delete user ${target.full_name} (${target.email})?`);
    if (!approved) {
      return;
    }

    try {
      await deleteUser(target.id);
      await loadData();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete user.");
      }
    }
  }

  if (!canManageUsers(currentUser)) {
    return (
      <section className="page">
        <div className="page-head">
          <h2>Users & Roles</h2>
          <p>Only admin can manage users and role assignments.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Users & Roles</h2>
        <p>Manage user access, role assignments, and account activation.</p>
      </div>

      <div className="action-row">
        <button className="primary-btn" type="button" onClick={() => setShowCreateForm((prev) => !prev)}>
          Add User
        </button>
        <button className="tab" type="button" onClick={() => setShowRoleCreateForm((prev) => !prev)}>
          Add Role
        </button>
      </div>

      {showRoleCreateForm && (
        <div className="inline-form-card">
          <h3>Create Role</h3>
          <div className="inline-form-grid">
            <label>
              Role Name
              <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="planner" />
            </label>
            <label>
              Active
              <select value={roleIsActive ? "yes" : "no"} onChange={(e) => setRoleIsActive(e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <div className="action-row">
            {permissionCheckbox("Manage Users", "can_manage_users", rolePermissions, setRolePermissions)}
            {permissionCheckbox("Manage Assets", "can_manage_assets", rolePermissions, setRolePermissions)}
            {permissionCheckbox("Create Work Orders", "can_create_work_orders", rolePermissions, setRolePermissions)}
            {permissionCheckbox("Update Work Orders", "can_update_work_orders", rolePermissions, setRolePermissions)}
            {permissionCheckbox("Import Master Data", "can_import_master_data", rolePermissions, setRolePermissions)}
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreateRole}
            disabled={isCreatingRole || roleName.trim().length < 2}
          >
            {isCreatingRole ? "Creating..." : "Save Role"}
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="inline-form-card">
          <h3>Create User</h3>
          <div className="inline-form-grid">
            <label>
              Full Name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </label>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 chars" />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as AuthUser["role"])}>
                {roleOptions().map((roleNameItem) => (
                  <option key={roleNameItem} value={roleNameItem}>
                    {toLabel(roleNameItem)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Active
              <select value={isActive ? "yes" : "no"} onChange={(e) => setIsActive(e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreateUser}
            disabled={isCreating || !fullName.trim() || !email.trim() || password.trim().length < 6}
          >
            {isCreating ? "Creating..." : "Save User"}
          </button>
        </div>
      )}

      {isLoading && <p className="state-note">Loading users...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>{toLabel(user.role)}</td>
                <td>{user.is_active ? "Yes" : "No"}</td>
                <td>
                  <div className="row-actions">
                    <button className="tab" type="button" onClick={() => openEditModal(user)}>
                      Edit
                    </button>
                    <button className="tab" type="button" onClick={() => handleToggleUserActive(user)}>
                      {user.is_active ? "Disable" : "Enable"}
                    </button>
                    <button className="tab" type="button" onClick={() => handleDelete(user)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={6}>No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Manage Users</th>
              <th>Manage Assets</th>
              <th>Create Work Orders</th>
              <th>Update Work Orders</th>
              <th>Import Master Data</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((roleItem) => (
              <tr key={`matrix-${roleItem.name}`}>
                <td>{toLabel(roleItem.name)}</td>
                <td>{roleItem.permissions.can_manage_users ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_manage_assets ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_create_work_orders ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_update_work_orders ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_import_master_data ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>System</th>
              <th>Active</th>
              <th>Manage Users</th>
              <th>Manage Assets</th>
              <th>Create WO</th>
              <th>Update WO</th>
              <th>Import Master</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((roleItem) => (
              <tr key={roleItem.name}>
                <td>{roleItem.name}</td>
                <td>{roleItem.is_system ? "Yes" : "No"}</td>
                <td>{roleItem.is_active ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_manage_users ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_manage_assets ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_create_work_orders ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_update_work_orders ? "Yes" : "No"}</td>
                <td>{roleItem.permissions.can_import_master_data ? "Yes" : "No"}</td>
                <td>
                  <div className="row-actions">
                    <button className="tab" type="button" onClick={() => openRoleEditModal(roleItem)}>
                      Edit
                    </button>
                    <button
                      className="tab"
                      type="button"
                      onClick={() => handleToggleRoleActive(roleItem)}
                      disabled={roleItem.is_system}
                    >
                      {roleItem.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="tab"
                      type="button"
                      onClick={() => handleDeleteRole(roleItem)}
                      disabled={roleItem.is_system}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && roles.length === 0 && (
              <tr>
                <td colSpan={9}>No roles found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={editingUser !== null}
        title={editingUser ? `Edit ${editingUser.email}` : "Edit User"}
        onClose={closeEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeEditModal}>
              Cancel
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || !editFullName.trim() || !editEmail.trim()}
            >
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="inline-form-grid">
          <label>
            Full Name
            <input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
          </label>
          <label>
            Email
            <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          </label>
          <label>
            New Password (optional)
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Leave blank to keep current"
            />
          </label>
          <label>
            Role
            <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              {roleOptions().map((roleNameItem) => (
                <option key={roleNameItem} value={roleNameItem}>
                  {toLabel(roleNameItem)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active
            <select value={editIsActive ? "yes" : "no"} onChange={(e) => setEditIsActive(e.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Modal>

      <Modal
        open={editingRole !== null}
        title={editingRole ? `Edit Role: ${editingRole.name}` : "Edit Role"}
        onClose={closeRoleEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeRoleEditModal}>
              Cancel
            </button>
            <button className="primary-btn" type="button" onClick={handleSaveRoleEdit} disabled={isSavingRole}>
              {isSavingRole ? "Saving..." : "Save Role"}
            </button>
          </>
        }
      >
        {editingRole && (
          <div>
            <div className="action-row">
              <label>
                Active
                <select
                  value={editRoleIsActive ? "yes" : "no"}
                  onChange={(e) => setEditRoleIsActive(e.target.value === "yes")}
                  disabled={editingRole.is_system}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className="action-row">
            {permissionCheckbox(
              "Manage Users",
              "can_manage_users",
              editRolePermissions,
              setEditRolePermissions,
              editingRole.is_system
            )}
            {permissionCheckbox(
              "Manage Assets",
              "can_manage_assets",
              editRolePermissions,
              setEditRolePermissions,
              editingRole.is_system
            )}
            {permissionCheckbox(
              "Create Work Orders",
              "can_create_work_orders",
              editRolePermissions,
              setEditRolePermissions,
              editingRole.is_system
            )}
            {permissionCheckbox(
              "Update Work Orders",
              "can_update_work_orders",
              editRolePermissions,
              setEditRolePermissions,
              editingRole.is_system
            )}
            {permissionCheckbox(
              "Import Master Data",
              "can_import_master_data",
              editRolePermissions,
              setEditRolePermissions,
              editingRole.is_system
            )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

