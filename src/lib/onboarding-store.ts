import { Store } from '@tauri-apps/plugin-store';

const STORE_NAME = 'onboarding.json';
const FEATURE_TOUR_KEY = 'featureTourSeen';

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_NAME);
  }
  return storeInstance;
}

export async function hasSeenFeatureTour(): Promise<boolean> {
  const store = await getStore();
  const value = await store.get<boolean>(FEATURE_TOUR_KEY);
  return value === true;
}

export async function markFeatureTourSeen(): Promise<void> {
  const store = await getStore();
  await store.set(FEATURE_TOUR_KEY, true);
  await store.save();
}
