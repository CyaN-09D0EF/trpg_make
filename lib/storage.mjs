import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class RoomStore {
  constructor(directory) { this.directory = directory; this.rooms = new Map(); this.locks = new Map(); }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const file of await readdir(this.directory)) {
      if (!/^[A-Z0-9]{6}\.json$/.test(file)) continue;
      // Fail visibly rather than silently replacing a damaged campaign.
      const room = JSON.parse(await readFile(path.join(this.directory, file), 'utf8'));
      if (room.schemaVersion !== 1 || `${room.id}.json` !== file || !room.players || !room.world) throw new Error(`Unsupported or invalid room file: ${file}`);
      this.rooms.set(room.id, room);
    }
  }
  async save(room) {
    const destination = path.join(this.directory, `${room.id}.json`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(room), { mode: 0o600 });
    await rename(temporary, destination);
    this.rooms.set(room.id, room);
  }
  async mutate(id, callback) {
    const previous = this.locks.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const original = this.rooms.get(id);
      if (!original) return null;
      const room = structuredClone(original);
      const result = await callback(room);
      await this.save(room);
      return result;
    });
    this.locks.set(id, task);
    try { return await task; }
    finally { if (this.locks.get(id) === task) this.locks.delete(id); }
  }
}
