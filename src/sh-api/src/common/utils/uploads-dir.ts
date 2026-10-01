import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Resolve the uploads directory in a way that works whether the API is started
 * from the workspace root or from the `sh-api/` folder.
 *
 * You can override the base dir using the `UPLOADS_DIR` env var.
 */
export function resolveUploadsDir(...parts: string[]): string {
  const envBase = (process.env.UPLOADS_DIR ?? '').trim();
  if (envBase) {
    return resolve(envBase, ...parts);
  }

  const cwd = process.cwd();
  const inCwd = resolve(cwd, 'uploads');
  const inParent = resolve(cwd, '..', 'uploads');

  const base = existsSync(inCwd) ? inCwd : existsSync(inParent) ? inParent : inCwd;
  return parts.length ? join(base, ...parts) : base;
}
