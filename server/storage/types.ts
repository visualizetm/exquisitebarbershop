/**
 * Where uploaded photos live. The service layer only talks to this port; the
 * driver is chosen by STORAGE_DRIVER (r2 in production, local in dev and tests).
 */
/**
 * How the browser sends the bytes: a PUT of the raw file (R2, local, GridFS), or a signed multipart
 * POST (Cloudinary), where `fields` are the form fields to send ahead of the `file` part.
 */
export type PresignedUpload =
  | {
      url: string;
      method: 'PUT';
      /** Headers the browser must send with the PUT. */
      headers: Record<string, string>;
      expiresAt: Date;
    }
  | {
      url: string;
      method: 'POST';
      fields: Record<string, string>;
      expiresAt: Date;
    };

export interface StoredObject {
  size: number;
  contentType: string;
  /** Cloudinary's version of the asset, so confirm can check what the browser reports. */
  version?: number;
}

export interface StorageDriver {
  readonly name: 'r2' | 'local' | 'mongo' | 'cloudinary';
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
  /** Cloudinary only: a signed call to the Admin API, for the doctor. Throws when it fails. */
  ping?(): Promise<void>;
  /** Cloudinary only: keys in the driver's folder created before the cutoff, for the orphan sweep. */
  listOlderThan?(cutoff: Date, limit: number): Promise<string[]>;
  /** Cloudinary only: the delivery address parts, so the browser can build exact sizes. */
  delivery?(key: string): { cloud: string; publicId: string };
}
