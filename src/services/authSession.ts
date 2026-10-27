import { ROLE_LADDER, type User, type UserRole } from '../types';

/** The one persisted session shape, shared by the sessionStorage copy and the durable IndexedDB mirror. */
export type PersistedAuthSession = {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number | null;
  /** Monotonic per browser: a login or refresh writes a revision above every stored one. */
  tokenRevision: number;
  /** The account the server acts as; while impersonating, the impersonated account. */
  user: User | null;
  /** Pre-launch only: the signed-in administrator while {@code user} is impersonated. */
  impersonator: User | null;
};

export function emptyAuthSession(): PersistedAuthSession {
  return { accessToken: '', refreshToken: '', idToken: '', expiresAt: null, tokenRevision: 0, user: null, impersonator: null };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isRole = (value: unknown): value is UserRole => typeof value === 'string' && (ROLE_LADDER as readonly string[]).includes(value);

function decodeUser(value: unknown): User | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { id, name, email, role, roles, faction, revision, active, created, updated } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof email !== 'string' || !isRole(role)
    || !Array.isArray(roles) || !roles.every(isRole)
    || (faction !== undefined && !(Array.isArray(faction) && faction.every((entry) => typeof entry === 'string')))
    || (revision !== undefined && typeof revision !== 'number')
    || typeof active !== 'boolean' || typeof created !== 'number' || !Number.isSafeInteger(created) || typeof updated !== 'number' || !Number.isSafeInteger(updated)) return undefined;
  return { id, name, email, role, roles, faction, revision, active, created, updated };
}

/** Validates untrusted stored data; anything else (including older record shapes) is discarded, never repaired. */
export function decodeAuthSession(value: unknown): PersistedAuthSession | null {
  if (!isRecord(value)) return null;
  const { accessToken, refreshToken, idToken, expiresAt, tokenRevision } = value;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof idToken !== 'string'
    || !(expiresAt === null || typeof expiresAt === 'number') || typeof tokenRevision !== 'number') return null;
  const user = decodeUser(value.user);
  const impersonator = decodeUser(value.impersonator);
  if (user === undefined || impersonator === undefined) return null;
  return { accessToken, refreshToken, idToken, expiresAt, tokenRevision, user, impersonator };
}
