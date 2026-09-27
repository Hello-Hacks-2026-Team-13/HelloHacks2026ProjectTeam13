import "./config.ts";
import { live } from "./config.ts";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Room, Profile } from "../../shared/types.ts";
export const admin = live
  ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const dataDir =
  process.env.DEMO_DATA_DIR ||
  fileURLToPath(new URL("../.data/", import.meta.url));
type Demo = {
  users: string[];
  rooms: Record<string, Room>;
  invites: Record<string, { roomId: string; expires: number }>;
};
let demo: Demo = { users: [], rooms: {}, invites: {} };
if (!live) {
  try {
    demo = JSON.parse(await readFile(`${dataDir}/demo.json`, "utf8"));
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
}
let writes = Promise.resolve();
function persist() {
  const content = JSON.stringify(demo);
  writes = writes
    .catch(() => {})
    .then(async () => {
      await mkdir(dataDir, { recursive: true });
      await writeFile(`${dataDir}/demo.tmp`, content, { mode: 0o600 });
      await rename(`${dataDir}/demo.tmp`, `${dataDir}/demo.json`);
    });
  return writes;
}
export async function newDemoUser() {
  const id = randomUUID();
  demo.users.push(id);
  await persist();
  return id;
}
export function validDemoUser(id: string) {
  return demo.users.includes(id);
}
export async function getRoom(userId: string): Promise<Room | null> {
  if (!admin)
    return structuredClone(
      Object.values(demo.rooms).find((r) =>
        r.profiles.some((p) => p.id === userId),
      ) || null,
    );
  const { data: membership, error } = await admin
    .from("memberships")
    .select("room_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;
  const { data, error: readError } = await admin
    .from("rooms")
    .select("data")
    .eq("id", membership.room_id)
    .single();
  if (readError) throw readError;
  return data.data as Room;
}
export async function createRoom(userId: string, profile: Profile) {
  const code = randomBytes(12).toString("hex");
  if (admin) {
    const { error } = await admin.rpc("create_pair", {
      actor: userId,
      profile,
      invite_digest: hash(code),
    });
    if (error) throw error;
  } else {
    if (await getRoom(userId)) throw new Error("You already have a space.");
    const id = randomUUID();
    demo.rooms[id] = {
      id,
      profiles: [profile],
      offers: [],
      plans: [],
      createdAt: new Date().toISOString(),
    };
    demo.invites[hash(code)] = { roomId: id, expires: Date.now() + 86400000 };
    await persist();
  }
  return code;
}
export async function joinRoom(userId: string, code: string, profile: Profile) {
  if (admin) {
    const { error } = await admin.rpc("join_pair", {
      actor: userId,
      profile,
      invite_digest: hash(code),
    });
    if (error) throw error;
  } else {
    const invite = demo.invites[hash(code)];
    if (
      !invite ||
      invite.expires < Date.now() ||
      !demo.rooms[invite.roomId] ||
      demo.rooms[invite.roomId].profiles.length !== 1
    )
      throw new Error("That invite is invalid, expired, or already used.");
    const current = Object.values(demo.rooms).find((r) =>
      r.profiles.some((p) => p.id === userId),
    );
    if (current) {
      if (current.profiles.length !== 1)
        throw new Error("Remove your current pairing first.");
      if (current.id === invite.roomId)
        throw new Error("Use an invite from a different space.");
      delete demo.rooms[current.id];
      for (const [key, existing] of Object.entries(demo.invites))
        if (existing.roomId === current.id) delete demo.invites[key];
    }
    demo.rooms[invite.roomId].profiles.push(profile);
    delete demo.invites[hash(code)];
    await persist();
  }
}
export async function rotateInvite(userId: string) {
  const room = await getRoom(userId);
  if (!room || room.profiles.length !== 1)
    throw new Error("A partner has already joined, or no space exists.");
  const code = randomBytes(12).toString("hex");
  if (admin) {
    const { error } = await admin
      .from("rooms")
      .update({
        invite_hash: hash(code),
        invite_expires: new Date(Date.now() + 86400000).toISOString(),
      })
      .eq("id", room.id);
    if (error) throw error;
  } else {
    for (const [key, invite] of Object.entries(demo.invites))
      if (invite.roomId === room.id) delete demo.invites[key];
    demo.invites[hash(code)] = {
      roomId: room.id,
      expires: Date.now() + 86400000,
    };
    await persist();
  }
  return code;
}
export async function removePairing(userId: string) {
  if (admin) {
    const { error } = await admin.rpc("remove_pairing", { actor: userId });
    if (error) throw error;
    return;
  }

  const room = Object.values(demo.rooms).find((r) =>
    r.profiles.some((p) => p.id === userId),
  );
  if (!room || room.profiles.length !== 2)
    throw new Error("There is no active pairing to remove.");
  delete demo.rooms[room.id];
  for (const [key, invite] of Object.entries(demo.invites))
    if (invite.roomId === room.id) delete demo.invites[key];
  await persist();
}
export async function mutateRoom(
  userId: string,
  fn: (room: Room) => void,
): Promise<Room> {
  if (!admin) {
    const room = Object.values(demo.rooms).find((r) =>
      r.profiles.some((p) => p.id === userId),
    );
    if (!room) throw new Error("Create or join a space first.");
    const next = structuredClone(room);
    fn(next);
    demo.rooms[room.id] = next;
    await persist();
    return structuredClone(next);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await getRoom(userId);
    if (!room) throw new Error("Create or join a space first.");
    const { data: row, error } = await admin
      .from("rooms")
      .select("data,version")
      .eq("id", room.id)
      .single();
    if (error) throw error;
    const next = row.data as Room;
    fn(next);
    const { data, error: updateError } = await admin
      .from("rooms")
      .update({ data: next, version: row.version + 1 })
      .eq("id", room.id)
      .eq("version", row.version)
      .select("id");
    if (updateError) throw updateError;
    if (data?.length) return next;
  }
  throw new Error("Your partner just changed this space. Please try again.");
}

// Used by the retention worker; service-role access stays on the server.
export async function listRooms(): Promise<Room[]> {
  if (!admin) return structuredClone(Object.values(demo.rooms));
  const rooms: Room[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin
      .from("rooms")
      .select("data")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rooms.push(...data.map((row) => row.data as Room));
    if (data.length < 500) return rooms;
  }
}
