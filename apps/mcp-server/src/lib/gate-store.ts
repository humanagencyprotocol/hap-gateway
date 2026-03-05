/**
 * Gate Store — durable local storage for gate content (problem/objective/tradeoffs).
 *
 * Persists to ~/.hap/gates.json so gate content survives server restarts.
 * The SP never sees this data — only hashes are sent to the SP.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface GateContent {
  problem: string;
  objective: string;
  tradeoffs: string;
}

export interface GateEntry {
  frameHash: string;
  path: string;
  profileId: string;
  gateContent: GateContent;
  storedAt: string;
}

interface GateFile {
  version: 1;
  entries: Record<string, GateEntry>;
}

const DEFAULT_PATH = process.env.HAP_DATA_DIR
  ? `${process.env.HAP_DATA_DIR}/gates.json`
  : `${process.env.HOME}/.hap/gates.json`;

export class GateStore {
  private entries = new Map<string, GateEntry>();
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? DEFAULT_PATH;
    this.load();
  }

  set(path: string, entry: GateEntry): void {
    this.entries.set(path, entry);
    this.persist();
  }

  get(path: string): GateEntry | null {
    return this.entries.get(path) ?? null;
  }

  getAll(): GateEntry[] {
    return Array.from(this.entries.values());
  }

  delete(path: string): void {
    this.entries.delete(path);
    this.persist();
  }

  load(): void {
    if (!existsSync(this.filePath)) {
      // Create directory and empty file
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.persist();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const data: GateFile = JSON.parse(raw);
      this.entries = new Map(Object.entries(data.entries));
    } catch {
      // Corrupted file — start fresh
      console.error(`[GateStore] Could not parse ${this.filePath}, starting fresh`);
      this.entries = new Map();
      this.persist();
    }
  }

  private persist(): void {
    const data: GateFile = {
      version: 1,
      entries: Object.fromEntries(this.entries),
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
