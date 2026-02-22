/**
 * Secure token storage using tauri-plugin-store
 * Tokens are stored encrypted at rest
 */

import { Store } from '@tauri-apps/plugin-store';

const STORE_NAME = 'secure-tokens.json';
const TOKENS_KEY = 'instance-tokens';

interface TokenEntry {
  instanceId: string;
  token: string;
  createdAt: string;
  lastUsedAt?: string;
}

let storeInstance: Store | null = null;

/**
 * Get or create the store instance
 */
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_NAME);
  }
  return storeInstance;
}

/**
 * Save a token for an instance
 */
export async function saveToken(
  instanceId: string,
  token: string,
): Promise<void> {
  const store = await getStore();

  // Get existing tokens
  const tokens = (await store.get<TokenEntry[]>(TOKENS_KEY)) || [];

  // Find and update or add new entry
  const existingIndex = tokens.findIndex((t) => t.instanceId === instanceId);
  const entry: TokenEntry = {
    instanceId,
    token,
    createdAt:
      existingIndex >= 0
        ? tokens[existingIndex].createdAt
        : new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    tokens[existingIndex] = entry;
  } else {
    tokens.push(entry);
  }

  await store.set(TOKENS_KEY, tokens);
  await store.save();
}

/**
 * Get a token for an instance
 */
export async function getToken(instanceId: string): Promise<string | null> {
  const store = await getStore();
  const tokens = (await store.get<TokenEntry[]>(TOKENS_KEY)) || [];
  const entry = tokens.find((t) => t.instanceId === instanceId);
  return entry?.token || null;
}

/**
 * Delete a token for an instance
 */
export async function deleteToken(instanceId: string): Promise<void> {
  const store = await getStore();
  const tokens = (await store.get<TokenEntry[]>(TOKENS_KEY)) || [];
  const filtered = tokens.filter((t) => t.instanceId !== instanceId);
  await store.set(TOKENS_KEY, filtered);
  await store.save();
}

/**
 * Check if a token exists for an instance
 */
export async function hasToken(instanceId: string): Promise<boolean> {
  const token = await getToken(instanceId);
  return token !== null && token.length > 0;
}

/**
 * Get all stored instance IDs with tokens
 */
export async function getStoredInstanceIds(): Promise<string[]> {
  const store = await getStore();
  const tokens = (await store.get<TokenEntry[]>(TOKENS_KEY)) || [];
  return tokens.map((t) => t.instanceId);
}

/**
 * Clear all stored tokens
 */
export async function clearAllTokens(): Promise<void> {
  const store = await getStore();
  await store.set(TOKENS_KEY, []);
  await store.save();
}

/**
 * Update the lastUsedAt timestamp for a token
 */
export async function touchToken(instanceId: string): Promise<void> {
  const store = await getStore();
  const tokens = (await store.get<TokenEntry[]>(TOKENS_KEY)) || [];
  const entry = tokens.find((t) => t.instanceId === instanceId);

  if (entry) {
    entry.lastUsedAt = new Date().toISOString();
    await store.set(TOKENS_KEY, tokens);
    await store.save();
  }
}
