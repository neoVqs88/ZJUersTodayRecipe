const PREFERENCES_KEY = 'user_preferences';

const DEFAULT_PREFERENCES = {
  darkMode: false,
  fontSize: 'standard',
  notificationsEnabled: true,
};

const VALID_FONT_SIZES = ['small', 'standard', 'large'];

export function getPreferences() {
  const stored = wx.getStorageSync(PREFERENCES_KEY) || {};
  const preferences = { ...DEFAULT_PREFERENCES, ...stored };
  if (!VALID_FONT_SIZES.includes(preferences.fontSize)) preferences.fontSize = 'standard';
  return preferences;
}

export function savePreferences(nextPreferences) {
  const preferences = { ...getPreferences(), ...nextPreferences };
  wx.setStorageSync(PREFERENCES_KEY, preferences);

  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.preferences = preferences;
    if (app && app.eventBus) app.eventBus.emit('preferences-change', preferences);
  } catch (error) {
    // App 初始化前调用时仅写入本地存储。
  }

  return preferences;
}

export function getAppearanceClass(preferences = getPreferences()) {
  const themeClass = preferences.darkMode ? 'theme-dark' : 'theme-light';
  return `${themeClass} font-${preferences.fontSize}`;
}

export function getFontSizeLabel(fontSize) {
  return {
    small: '小',
    standard: '标准',
    large: '大',
  }[fontSize] || '标准';
}

export { DEFAULT_PREFERENCES, PREFERENCES_KEY };
