"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { devices, groups } from "@/db/schema";
import { ensureDefaultGroup, MAX_GROUPS } from "@/lib/data";
import { generateDeviceToken } from "@/lib/device-token";
import { requireUser } from "@/lib/session";

/** Accept only a #rrggbb hex color; fall back to the default otherwise so a
 *  malformed value can't render a broken swatch or pollute stored data. */
function safeColor(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#6366f1";
}

/** Count the user's groups (for the MAX_GROUPS cap). */
async function groupCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groups)
    .where(eq(groups.ownerId, userId));
  return rows[0]?.n ?? 0;
}

export async function createGroup(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const color = safeColor(String(formData.get("color") ?? "#6366f1"));
  if (!name) return;
  // An account may hold at most MAX_GROUPS groups (each is budgeted half the
  // account limit). Silently ignore over-cap creates; the UI also disables the form.
  if ((await groupCount(user.id)) >= MAX_GROUPS) return;
  await db.insert(groups).values({ id: randomUUID(), ownerId: user.id, name, color });
  revalidatePath("/groups");
  revalidatePath("/dashboard");
}

/** Edit a group's color (and optionally name). */
export async function updateGroup(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const color = safeColor(String(formData.get("color") ?? "#6366f1"));
  const set: { color: string; name?: string } = { color };
  const rawName = formData.get("name");
  if (rawName != null) {
    const name = String(rawName).trim();
    if (name) set.name = name;
  }
  await db
    .update(groups)
    .set(set)
    .where(and(eq(groups.id, id), eq(groups.ownerId, user.id)));
  revalidatePath("/groups");
  revalidatePath("/dashboard");
}

export async function deleteGroup(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  // Reassign this group's devices before deleting so none are left ungrouped.
  const other = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.ownerId, user.id), ne(groups.id, id)))
    .orderBy(asc(groups.createdAt))
    .limit(1);
  const hasDevices = (
    await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, user.id), eq(devices.groupId, id)))
      .limit(1)
  )[0];
  if (hasDevices) {
    // Target an existing other group, or mint a fresh Default if this was the last.
    let targetId = other[0]?.id;
    if (!targetId) {
      const made = await db
        .insert(groups)
        .values({ id: randomUUID(), ownerId: user.id, name: "Default", color: "#6366f1" })
        .returning();
      targetId = made[0].id;
    }
    await db
      .update(devices)
      .set({ groupId: targetId })
      .where(and(eq(devices.userId, user.id), eq(devices.groupId, id)));
  }
  await db.delete(groups).where(and(eq(groups.id, id), eq(groups.ownerId, user.id)));
  revalidatePath("/groups");
  revalidatePath("/devices");
  revalidatePath("/dashboard");
}

/** Returns groupId only if it belongs to the user; null otherwise. Prevents
 *  attaching a device to another tenant's group (IDOR). */
async function ownedGroupId(
  userId: string,
  groupId: string | null,
): Promise<string | null> {
  if (!groupId) return null;
  const owned = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
    .limit(1);
  return owned[0] ? groupId : null;
}

export async function assignDeviceGroup(formData: FormData) {
  const user = await requireUser();
  const deviceId = String(formData.get("deviceId"));
  const raw = String(formData.get("groupId") ?? "");
  // Every device must belong to a group — fall back to the default rather than null.
  const owned = await ownedGroupId(user.id, raw === "" ? null : raw);
  const groupId = owned ?? (await ensureDefaultGroup(user.id)).id;
  await db
    .update(devices)
    .set({ groupId })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
  revalidatePath("/devices");
  revalidatePath("/dashboard");
}

/** Creates a device + its API token. Returns the plaintext token ONCE. */
export async function createDevice(
  name: string,
  groupId: string | null,
): Promise<{ id: string; token: string }> {
  const user = await requireUser();
  // Devices are always grouped — fall back to the default when none is chosen.
  const safeGroupId =
    (await ownedGroupId(user.id, groupId || null)) ??
    (await ensureDefaultGroup(user.id)).id;
  const { token, tokenHash, tokenPrefix } = generateDeviceToken();
  const id = randomUUID();
  await db.insert(devices).values({
    id,
    userId: user.id,
    groupId: safeGroupId,
    name: name.trim() || "New device",
    tokenHash,
    tokenPrefix,
  });
  revalidatePath("/devices");
  revalidatePath("/dashboard");
  return { id, token };
}

export async function revokeDevice(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await db
    .update(devices)
    .set({ revoked: true })
    .where(and(eq(devices.id, id), eq(devices.userId, user.id)));
  revalidatePath("/devices");
}

export async function deleteDevice(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await db.delete(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
  revalidatePath("/devices");
  revalidatePath("/dashboard");
}
