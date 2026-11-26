import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** target is root or below it. A child folder whose name starts with ".." counts as inside. */
export const inside = (root: string, target: string) => {
 const rel = relative(root, target);
 return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** The real path, or the resolved path when the path does not exist. */
export const realOrResolved = (path: string) => { try { return realpathSync(resolve(path)); } catch { return resolve(path); } };
