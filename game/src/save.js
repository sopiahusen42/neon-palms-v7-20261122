// Progress saved to localStorage: cash, wanted level, health, ammo, which
// missions are done, and where the player left off. Loading restores the world
// state; a corrupt or absent save is simply no save.

const KEY = 'neon-palms-save-v1';

export const SaveSystem = {
  hasSave() {
    try {
      return window.localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  },

  write(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, at: Date.now(), ...state }));
      return true;
    } catch {
      return false;
    }
  },

  read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === null) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  },

  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  },
};
