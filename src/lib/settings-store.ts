import { Store } from '@tauri-apps/plugin-store';
import type { AppConfig } from '@/stores';

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load('settings-page.json');
  }
  return storeInstance;
}

const DRAFT_KEY = 'settingsDraft';
const CATEGORY_KEY = 'settingsCategory';
const SELECTED_INSTANCE_KEY = 'settingsSelectedInstanceId';

export type SettingsCategory =
  | 'general'
  | 'network'
  | 'notifications'
  | 'advanced';

export async function loadSettingsDraft(): Promise<Partial<AppConfig> | null> {
  const store = await getStore();
  const draft = await store.get<Partial<AppConfig>>(DRAFT_KEY);
  return draft ?? null;
}

export async function saveSettingsDraft(
  draft: Partial<AppConfig>,
): Promise<void> {
  const store = await getStore();
  await store.set(DRAFT_KEY, draft);
  await store.save();
}

export async function clearSettingsDraft(): Promise<void> {
  const store = await getStore();
  await store.delete(DRAFT_KEY);
  await store.save();
}

export async function loadSettingsCategory(): Promise<SettingsCategory> {
  const store = await getStore();
  const category = await store.get<SettingsCategory>(CATEGORY_KEY);
  if (
    category === 'general' ||
    category === 'network' ||
    category === 'notifications' ||
    category === 'advanced'
  ) {
    return category;
  }
  return 'general';
}

export async function saveSettingsCategory(
  category: SettingsCategory,
): Promise<void> {
  const store = await getStore();
  await store.set(CATEGORY_KEY, category);
  await store.save();
}

export async function loadSettingsSelectedInstanceId(): Promise<string | null> {
  const store = await getStore();
  const instanceId = await store.get<string>(SELECTED_INSTANCE_KEY);
  return instanceId?.trim() ? instanceId : null;
}

export async function saveSettingsSelectedInstanceId(
  instanceId: string | null,
): Promise<void> {
  const store = await getStore();
  if (!instanceId) {
    await store.delete(SELECTED_INSTANCE_KEY);
  } else {
    await store.set(SELECTED_INSTANCE_KEY, instanceId);
  }
  await store.save();
}

export async function clearSettingsSelectedInstanceId(): Promise<void> {
  const store = await getStore();
  await store.delete(SELECTED_INSTANCE_KEY);
  await store.save();
}
