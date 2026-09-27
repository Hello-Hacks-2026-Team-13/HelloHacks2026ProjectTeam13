import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { admin, listRooms, mutateRoom } from "./store.ts";

const bucket = "daily-moments";
const directory = `${process.env.DEMO_DATA_DIR || fileURLToPath(new URL("../.data/", import.meta.url))}/moments`;
const filePattern = /^\d{13}_[a-f0-9-]{36}_\d{13}_[a-f0-9-]{36}\.jpg$/;
function checkFile(file: string) {
  if (!filePattern.test(file)) throw new Error("Invalid moment photo.");
}
export async function saveMomentFile(file: string, bytes: Buffer) {
  checkFile(file);
  if (admin) {
    const { error } = await admin.storage
      .from(bucket)
      .upload(file, bytes, {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: false,
      });
    if (error)
      throw new Error(
        "Photo storage is unavailable. Apply supabase/daily_moments.sql and try again.",
      );
  } else {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(`${directory}/${file}`, bytes, { mode: 0o600, flag: "wx" });
  }
}
export async function readMomentFile(file: string) {
  checkFile(file);
  if (!admin) return readFile(`${directory}/${file}`);
  const { data, error } = await admin.storage.from(bucket).download(file);
  if (error) throw new Error("This photo is no longer available.");
  return Buffer.from(await data.arrayBuffer());
}
export async function deleteMomentFiles(files: string[]) {
  if (!files.length) return;
  files.forEach(checkFile);
  if (admin) {
    for (let start = 0; start < files.length; start += 100) {
      const { error } = await admin.storage
        .from(bucket)
        .remove(files.slice(start, start + 100));
      if (error) throw error;
    }
  } else {
    await Promise.all(
      files.map((file) =>
        unlink(`${directory}/${file}`).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        }),
      ),
    );
  }
}
async function storedFiles() {
  if (!admin)
    return (
      await readdir(directory).catch((error) => {
        if (error.code === "ENOENT") return [] as string[];
        throw error;
      })
    ).filter((file) => filePattern.test(file));
  const files: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list("", {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw error;
    files.push(
      ...data.map((item) => item.name).filter((file) => filePattern.test(file)),
    );
    if (data.length < 1000) return files;
  }
}
let cleaning = false;
export async function cleanupMoments(now = Date.now()) {
  if (cleaning) return;
  cleaning = true;
  try {
    const rooms = await listRooms();
    for (const room of rooms) {
      if (room.moments?.rounds.some((r) => Date.parse(r.expiresAt) <= now)) {
        await mutateRoom(room.profiles[0].id, (current) => {
          if (current.id === room.id && current.moments)
            current.moments.rounds = current.moments.rounds.filter(
              (r) => Date.parse(r.expiresAt) > now,
            );
        }).catch((error) =>
          console.error("Moment metadata cleanup will retry:", error.message),
        );
      }
    }
    const ids = new Set(rooms.map((room) => room.id));
    const referenced = new Set(
      rooms.flatMap(
        (room) =>
          room.moments?.rounds.flatMap((r) =>
            Object.values(r.photos).map((p) => p.file),
          ) || [],
      ),
    );
    const files = await storedFiles();
    await deleteMomentFiles(
      files.filter((file) => {
        const [expiry, roomId, uploaded] = file.split("_");
        // Grace period protects uploads between object creation and metadata commit.
        return (
          Number(expiry) <= now ||
          (Number(uploaded) < now - 15 * 60000 &&
            (!ids.has(roomId) || !referenced.has(file)))
        );
      }),
    );
  } finally {
    cleaning = false;
  }
}
export function startMomentCleanup() {
  const run = () =>
    void cleanupMoments().catch((error) =>
      console.error("Daily moment cleanup will retry:", error.message),
    );
  run();
  const timer = setInterval(run, 60000);
  timer.unref();
}
