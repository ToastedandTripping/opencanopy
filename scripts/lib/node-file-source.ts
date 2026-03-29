/**
 * PMTiles Source interface for local files in Node.js.
 *
 * The browser FileSource in pmtiles uses File.slice().arrayBuffer(),
 * which doesn't work in Node. This implementation uses fs/promises
 * to read ranges directly from a file descriptor.
 */

import { open, FileHandle } from "fs/promises";
import type { Source, RangeResponse } from "pmtiles";

export class NodeFileSource implements Source {
  private path: string;
  private fh: FileHandle | null = null;

  constructor(path: string) {
    this.path = path;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    if (!this.fh) {
      this.fh = await open(this.path, "r");
    }
    const buffer = Buffer.alloc(length);
    await this.fh.read(buffer, 0, length, offset);
    return {
      data: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer,
    };
  }

  getKey(): string {
    return this.path;
  }

  async close(): Promise<void> {
    if (this.fh) {
      await this.fh.close();
      this.fh = null;
    }
  }
}
