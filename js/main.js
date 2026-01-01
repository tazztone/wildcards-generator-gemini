import { App } from './app.js';
import { State } from './state.js';
import { UI } from './ui.js';
import { loadConfig } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await App.init();

    // Expose for testing
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.App = App;
        window.State = State;
        window.UI = UI;
    }
});
