import { getAppearanceClass, getPreferences } from '~/services/preferences';

export default Behavior({
  data: {
    appearanceClass: 'theme-light font-standard',
  },
  lifetimes: {
    attached() {
      this.refreshAppearance();
      this.__appearanceHandler = (preferences) => this.refreshAppearance(preferences);
      const app = getApp();
      if (app && app.eventBus) app.eventBus.on('preferences-change', this.__appearanceHandler);
    },
    detached() {
      const app = getApp();
      if (app && app.eventBus && this.__appearanceHandler) {
        app.eventBus.off('preferences-change', this.__appearanceHandler);
      }
    },
  },
  pageLifetimes: {
    show() {
      this.refreshAppearance();
    },
  },
  methods: {
    refreshAppearance(preferences = getPreferences()) {
      this.setData({ appearanceClass: getAppearanceClass(preferences) });
    },
  },
});
