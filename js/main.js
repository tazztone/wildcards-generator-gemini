import { App } from './app.js';
import { loadConfig } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await App.init();
});
