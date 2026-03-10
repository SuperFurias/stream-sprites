// User skin cache management module
export function createUserSkinCache() {
  return new Map();
}

export async function fetchUserSkin(username, userSkinCache) {
  try {
    const res = await fetch(`/api/user/${encodeURIComponent(username)}`);
    if (res.ok) {
      const data = await res.json();
      userSkinCache.set(username.toLowerCase(), data.assigned_skin || 'default');
      return data.assigned_skin || 'default';
    }
  } catch (e) {
    console.warn('Failed to fetch skin for', username, e);
  }
  return 'default';
}

export function getUserSkinFromCache(userSkinCache, username) {
  return userSkinCache.get(username.toLowerCase()) || 'default';
}

export function cacheUserSkin(userSkinCache, username, skinId) {
  userSkinCache.set(username.toLowerCase(), skinId);
}
