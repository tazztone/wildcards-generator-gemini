import { App } from './app.js';
import { State } from './state.js';
import { UI } from './ui.js';
import { Api } from './api.js';
import { loadConfig, Config } from './config.js';
import { DragDrop } from './modules/drag-drop.js';
import { ImportExport } from './modules/import-export.js';
import { Settings } from './modules/settings.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await App.init();

    // Expose for testing
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.App = App;
        window.State = State;
        window.UI = UI;
        window.Api = Api;
        window.Config = Config;
        window.DragDrop = DragDrop;
        window.ImportExport = ImportExport;
        window.Settings = Settings;
    }
});
