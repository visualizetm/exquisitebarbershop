import type { Page } from '@playwright/test';

/**
 * Uploads a sample photo through the real flow, from inside the page: a canvas
 * drawn in the browser, encoded to WebP, PUT to the presigned URL, confirmed.
 * The page must already be signed in as the owner (the Secure cookie only
 * travels with requests the browser makes).
 */
export async function uploadSamplePhoto(
  page: Page,
  input: {
    kind: 'staff' | 'gallery' | 'hero';
    staffId?: string;
    alt: string;
    label: string;
    color: string;
  },
): Promise<{ id: string; url: string }> {
  return page.evaluate(async (args) => {
    const width = args.kind === 'hero' ? 1600 : 1200;
    const height = args.kind === 'hero' ? 900 : 1500;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = args.color;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(args.label, width / 2, height / 2);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('encode failed'));
        },
        'image/webp',
        0.82,
      );
    });
    const issue = await fetch('/api/admin/photos/upload-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: args.kind,
        ...(args.staffId ? { staffId: args.staffId } : {}),
        contentType: 'image/webp',
        size: blob.size,
      }),
    });
    if (!issue.ok) throw new Error(`upload-url ${String(issue.status)}: ${await issue.text()}`);
    const issued = (await issue.json()) as {
      uploadUrl: string;
      ticket: string;
      headers: Record<string, string>;
    };
    const put = await fetch(issued.uploadUrl, {
      method: 'PUT',
      headers: issued.headers,
      body: blob,
    });
    if (!put.ok) throw new Error(`put ${String(put.status)}`);
    const confirm = await fetch('/api/admin/photos/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: issued.ticket, width, height, alt: args.alt }),
    });
    if (!confirm.ok) throw new Error(`confirm ${String(confirm.status)}: ${await confirm.text()}`);
    const body = (await confirm.json()) as { photo: { id: string; url: string } };
    return body.photo;
  }, input);
}

/** Staff ids by slug, from the public list. */
export async function staffIds(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const res = await fetch('/api/staff');
    const body = (await res.json()) as { staff: { slug: string; id: string }[] };
    return Object.fromEntries(body.staff.map((s) => [s.slug, s.id]));
  });
}
