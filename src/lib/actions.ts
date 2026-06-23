"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { devices, groups } from "@/db/schema";
import { generateDeviceToken } from "@/lib/device-token";
import { requireUser } from "@/lib/session";

/** Accept only a #rrggbb hex color; fall back to the default otherwise so a
 *  malformed value can't render a broken swatch or pollute stored data. */
function safeColor(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#6366f1";
}

export async function createGroup(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const color = safeColor(String(formData.get("color") ?? "#6366f1"));
  if (!name) return;
  await db.insert(groups).values({ id: randomUUID(), ownerId: user.id, name, color });
  revalidatePath("/groups");
  revalidatePath("/dashboard");
}

export async function deleteGroup(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
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
  const groupId = await ownedGroupId(user.id, raw === "" ? null : raw);
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
  const safeGroupId = await ownedGroupId(user.id, groupId || null);
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
