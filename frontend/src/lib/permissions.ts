import type { AuthUser } from "./types";

export function canManageAssets(user: AuthUser): boolean {
  return user.permissions.can_manage_assets;
}

export function canCreateWorkOrders(user: AuthUser): boolean {
  return user.permissions.can_create_work_orders;
}

export function canManageUsers(user: AuthUser): boolean {
  return user.permissions.can_manage_users;
}

export function canUpdateWorkOrders(user: AuthUser): boolean {
  return user.permissions.can_update_work_orders;
}

export function canImportMasterData(user: AuthUser): boolean {
  return user.permissions.can_import_master_data;
}

export function roleLabel(role: AuthUser["role"]): string {
  return role.replace("_", " ");
}
