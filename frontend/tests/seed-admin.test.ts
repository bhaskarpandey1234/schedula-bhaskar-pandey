import { describe, expect, it, vi } from "vitest";
import {
  createSeedAdmin,
  productionConfirmation,
  productionProjectRef,
  validateAdminSeedEnvironment,
} from "../scripts/seed-admin.mjs";

function validEnvironment() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${productionProjectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-secret",
    ADMIN_SEED_PASSWORD: "unique-production-test-password",
    ADMIN_SEED_PROJECT_REF: productionProjectRef,
    ADMIN_SEED_CONFIRMATION: productionConfirmation,
  };
}

describe("production admin seed safeguards", () => {
  it("requires all credentials and explicit confirmation for the production project", () => {
    expect(validateAdminSeedEnvironment(validEnvironment()).url).toBe(`https://${productionProjectRef}.supabase.co`);
    expect(() => validateAdminSeedEnvironment({ ...validEnvironment(), ADMIN_SEED_CONFIRMATION: "" })).toThrow(/exact project ref and production confirmation/);
    expect(() => validateAdminSeedEnvironment({ ...validEnvironment(), NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co" })).toThrow(/does not match the approved production project/);
    expect(() => validateAdminSeedEnvironment({ ...validEnvironment(), ADMIN_SEED_PASSWORD: "short" })).toThrow(/at least 12 characters/);
    expect(() => validateAdminSeedEnvironment({ ...validEnvironment(), VERCEL: "1" })).toThrow(/run manually/);
  });

  it("creates a new admin and returns only its generated email", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user-id" } }, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "new-user-id" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eqRole = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqRole });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const admin = {
      auth: { admin: { createUser, updateUserById, deleteUser: vi.fn() } },
      from: vi.fn().mockReturnValue({ update }),
    };

    const result = await createSeedAdmin({ admin, password: "unique-production-test-password", suffix: "test-suffix" });

    expect(result).toEqual({ email: "schedula-admin-test-suffix@mailinator.com" });
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: result.email,
      password: "unique-production-test-password",
      email_confirm: true,
    }));
    expect(update).toHaveBeenCalledWith({ role: "admin", full_name: "Schedula Production Admin" });
    expect(updateUserById).toHaveBeenCalledWith("new-user-id", expect.objectContaining({
      app_metadata: { schedula_role: "admin" },
      user_metadata: expect.objectContaining({ role: "admin" }),
    }));
  });

  it("does not modify an existing account when generated email creation conflicts", async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("User already registered") });
    const admin = {
      auth: { admin: { createUser, updateUserById: vi.fn(), deleteUser: vi.fn() } },
      from: vi.fn(),
    };

    await expect(createSeedAdmin({ admin, password: "unique-production-test-password", suffix: "existing" })).rejects.toThrow(/No existing account was changed/);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes a newly created auth user if admin promotion fails", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({ error: new Error("profile update failed") });
    const select = vi.fn().mockReturnValue({ single });
    const eqRole = vi.fn().mockReturnValue({ select });
    const eqId = vi.fn().mockReturnValue({ eq: eqRole });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const admin = {
      auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { id: "partial-user" } }, error: null }), updateUserById: vi.fn(), deleteUser } },
      from: vi.fn().mockReturnValue({ update }),
    };

    await expect(createSeedAdmin({ admin, password: "unique-production-test-password", suffix: "rollback" })).rejects.toThrow(/Admin profile promotion failed/);
    expect(deleteUser).toHaveBeenCalledWith("partial-user");
  });
});
