/**
 * Where uploaded photos live. The service layer only talks to this port; the
 * driver is chosen by STORAGE_DRIVER (r2 in production, local in dev and tests).
 */
export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the browser must send with the PUT. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  size: number;
  contentType: string;
}

export interface StorageDriver {
  readonly name: 'r2' | 'local' | 'mongo';
  /** A URL the browser may PUT one object to, for a short time. The key is always server made. */
  presignUpload(input: {
    key: string;
    contentType: string;
    size: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  /** Null when the object does not exist. */
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Server-side write, for backups and the doctor. Photos never go through here. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Null when the object does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** The public, unsigned URL for a key. */
  publicUrl(key: string): string;
}
