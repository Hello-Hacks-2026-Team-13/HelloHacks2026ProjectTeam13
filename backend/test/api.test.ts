import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import sharp from "sharp";
import { defaultProfile } from "../src/domain.ts";

test("API: real pairing, private reads, three suggestions, two votes, cancellation and persistence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "across-test-"));
  const port = 33000 + Math.floor(Math.random() * 10000);
  let server: ReturnType<typeof spawn>;
  async function start() {
    server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        APP_MODE: "demo",
        TOKEN_ENCRYPTION_KEY: "",
        NODE_ENV: "test",
        DEMO_DATA_DIR: dir,
        TMDB_READ_ACCESS_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Test server did not start")),
        10000,
      );
      server.stdout?.on("data", (chunk) => {
        if (chunk.toString().includes("Across API")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Test server exited: ${code}`));
      });
      server.stderr?.on("data", (chunk) => {
        if (chunk.toString().includes("Error")) {
          clearTimeout(timeout);
          reject(new Error(chunk.toString()));
        }
      });
    });
  }
  async function stop() {
    if (server.exitCode === null) {
      server.kill();
      await once(server, "exit");
    }
  }
  async function call(
    path: string,
    token = "",
    method = "GET",
    body?: unknown,
  ) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    await start();
    assert.equal((await call("/state")).status, 401);
    const a = (await call("/demo/session", "", "POST")).data.token,
      b = (await call("/demo/session", "", "POST")).data.token,
      c = (await call("/demo/session", "", "POST")).data.token;
    const profile = {
      ...defaultProfile(a, "Test A"),
      timezone: "UTC",
      startHour: 0,
      endHour: 24,
      duration: 120,
    };
    const created = await call("/pair/create", a, "POST", { profile });
    assert.equal(created.status, 200);
    assert.equal(
      (
        await call("/pair/join", b, "POST", {
          code: created.data.code,
          profile: { ...profile, id: b, name: "Test B" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/pair/join", c, "POST", {
          code: created.data.code,
          profile,
        })
      ).status,
      409,
    );
    assert.equal((await call("/state", c)).data.room, null);
    assert.equal((await call("/state", b)).data.room.profiles.length, 2);
    const ideas = await call("/suggestions", a, "POST");
    assert.equal(ideas.data.offers.length, 3);
    const id = ideas.data.offers[0].id;
    assert.equal(
      (await call("/plans", a, "POST", { offerId: id })).status,
      200,
    );
    assert.equal(
      (await call("/state", b)).data.room.plans[0].status,
      "pending",
    );
    assert.equal((await call(`/plans/${id}/accept`, c, "POST")).status, 409);
    assert.equal((await call(`/plans/${id}/accept`, a, "POST")).status, 200);
    assert.equal(
      (await call("/state", a)).data.room.plans[0].status,
      "pending",
    );
    await Promise.all([
      call(`/plans/${id}/accept`, b, "POST"),
      call(`/plans/${id}/accept`, b, "POST"),
    ]);
    let plan = (await call("/state", a)).data.room.plans[0];
    assert.equal(plan.status, "saved");
    assert.equal(plan.acceptedBy.length, 2);
    await stop();
    await start();
    plan = (await call("/state", b)).data.room.plans[0];
    assert.equal(plan.status, "saved");
    assert.equal((await call(`/plans/${id}/cancel`, b, "POST")).status, 200);
    assert.equal((await call(`/plans/${id}/accept`, a, "POST")).status, 409);
    await call("/preferences", a, "PUT", {
      profile: { ...profile, duration: 30 },
    });
    const shortIdeas = (await call("/suggestions", a, "POST")).data.offers;
    assert.equal(shortIdeas.length, 3);
    assert.ok(
      shortIdeas.every(
        (offer: { activity: { minutes: number } }) =>
          offer.activity.minutes <= 30,
      ),
    );
    assert.equal(
      (
        await call("/preferences", a, "PUT", {
          profile: { ...profile, timezone: "Mars/Olympus" },
        })
      ).status,
      400,
    );
    // Daily moments: real authenticated routes and real image storage.
    const daily = await call("/moments", a);
    assert.equal(daily.status, 200);
    const round = daily.data.rounds[0];
    const photo = (
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#cb6554" },
      })
        .png()
        .toBuffer()
    ).toString("base64");
    const upload = async (token: string, content = photo) =>
      fetch(`http://127.0.0.1:${port}/api/moments/${round.id}/photo`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: content,
      });
    assert.equal((await upload(c)).status, 409);
    assert.equal(
      (await upload(a, Buffer.from("not an image").toString("base64"))).status,
      409,
    );
    assert.equal((await upload(a)).status, 200);
    assert.equal((await upload(a)).status, 200); // replacement leaves one object
    assert.equal((await readdir(join(dir, "moments"))).length, 1);
    assert.equal(
      (await call(`/moments/${round.id}/photos/${a}`, a)).status,
      200,
    );
    assert.equal(
      (await call(`/moments/${round.id}/photos/${a}`, b)).status,
      403,
    );
    assert.equal(
      (await call(`/moments/${round.id}/photos/${a}`, c)).status,
      409,
    );
    assert.equal((await call("/state", b)).data.room.moments, undefined);
    assert.equal(
      (
        await call(`/moments/${round.id}/photos/${a}/reaction`, b, "PUT", {
          emoji: "❤️",
          message: "Too early",
        })
      ).status,
      409,
    );
    await stop();
    const saved = JSON.parse(await readFile(join(dir, "demo.json"), "utf8"));
    const storedRoom = Object.values(saved.rooms)[0] as any;
    storedRoom.moments.rounds[0].revealAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await writeFile(join(dir, "demo.json"), JSON.stringify(saved));
    await start();
    // One missing submission does not prevent reveal.
    assert.equal(
      (await call(`/moments/${round.id}/photos/${a}`, b)).status,
      200,
    );
    assert.equal((await upload(a)).status, 409);
    assert.equal(
      (
        await call(`/moments/${round.id}/photos/${a}/reaction`, b, "PUT", {
          emoji: "❤️",
          message: "Made me smile",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(`/moments/${round.id}/photos/${a}/reaction`, b, "PUT", {
          emoji: "😂",
          message: "Updated",
        })
      ).status,
      200,
    );
    const revealed = (await call("/moments", a)).data.rounds.find(
      (r: any) => r.id === round.id,
    );
    assert.equal(revealed.photos[0].reactions.length, 1);
    assert.equal(revealed.photos[0].reactions[0].message, "Updated");
    assert.equal(
      (
        await call(`/moments/${round.id}/photos/${a}/reaction`, b, "PUT", {
          emoji: "❤️",
          message: "x".repeat(241),
        })
      ).status,
      400,
    );
    // An outsider cannot remove a pair; removal frees both accounts.
    assert.equal((await call("/pair/remove", c, "POST")).status, 409);
    assert.equal((await call("/pair/remove", a, "POST")).status, 200);
    assert.equal((await readdir(join(dir, "moments"))).length, 0);
    assert.equal(
      (await call(`/moments/${round.id}/photos/${a}`, b)).status,
      409,
    );
    assert.equal((await call("/state", a)).data.room, null);
    assert.equal((await call("/state", b)).data.room, null);
    const solo = await call("/pair/create", a, "POST", { profile });
    const other = await call("/pair/create", c, "POST", { profile });
    assert.equal(
      (
        await call("/pair/join", a, "POST", {
          code: other.data.code,
          profile,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/pair/join", b, "POST", {
          code: solo.data.code,
          profile,
        })
      ).status,
      409,
    );
    await stop();
    await start();
    assert.equal((await call("/state", a)).data.room.profiles.length, 2);
    assert.equal((await call("/state", b)).data.room, null);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
