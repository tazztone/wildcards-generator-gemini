import gradio as gr
import tempfile
import os

from .utils import (
    load_config, load_initial_data, get_all_paths, get_data_by_path,
    get_wildcards_by_path, get_parent_structure_by_path, process_ruamel_node,
    reconstruct_yaml_structure, yaml, get_base_dir
)
from .api import Api

# Global API instance
api = Api()

# --- Event Handlers ---

def update_settings(provider, key, model, url, state):
    state['api_keys'][provider] = key
    state['models'][provider] = model
    if provider == 'custom':
        state['models']['custom_url'] = url
    state['active_provider'] = provider
    return state

def on_path_change(path, state):
    data_node = get_data_by_path(path, state)
    if not data_node: return gr.update(choices=[], value=[])
    wildcards = data_node.get('wildcards', [])
    return gr.update(choices=wildcards, value=wildcards)

def create_category_confirm(name, state):
    if not name.strip(): return state, gr.update()
    parts = name.strip().split('/')
    current = state['wildcards']
    for part in parts:
        if part not in current:
            current[part] = {'instruction': '', 'wildcards': []}
        current = current[part]

    all_paths = get_all_paths(state['wildcards'])
    return state, gr.update(choices=all_paths, value=name.strip())

def delete_category_handler(path, state):
    if not path: return state, gr.update(), gr.update()
    # Find parent
    parts = path.split('/')
    if len(parts) == 1:
        if path in state['wildcards']:
            del state['wildcards'][path]
    else:
        parent_path = '/'.join(parts[:-1])
        key = parts[-1]
        parent_node = get_data_by_path(parent_path, state)
        if parent_node and key in parent_node:
            del parent_node[key]

    all_paths = get_all_paths(state['wildcards'])
    new_val = all_paths[0] if all_paths else None
    return state, gr.update(choices=all_paths, value=new_val), gr.update(value=new_val) # Trigger path change

def add_wildcard_handler(path, new_wildcard, state):
    if not path or not new_wildcard.strip(): return state, gr.update(), gr.update()
    data_node = get_data_by_path(path, state)
    if not data_node: return state, gr.update(), gr.update()
    wildcards = data_node.get('wildcards', [])
    wildcards.append(new_wildcard.strip())
    data_node['wildcards'] = sorted(list(set(wildcards)))
    return state, gr.update(choices=data_node['wildcards'], value=data_node['wildcards']), gr.update(value="")

def delete_selected_handler(path, selected, state):
    if not path or not selected: return state, gr.update()
    data_node = get_data_by_path(path, state)
    if not data_node: return state, gr.update()
    current = data_node.get('wildcards', [])
    updated = [w for w in current if w not in selected]
    data_node['wildcards'] = updated
    return state, gr.update(choices=updated, value=updated)

def generate_more_handler(path, state, global_prompt):
    if not path:
        gr.Warning("No category selected!")
        return state, gr.update()

    data_node = get_data_by_path(path, state)
    existing_words = data_node.get('wildcards', [])
    custom_instructions = data_node.get('instruction', '')

    api_keys = state['api_keys']
    models = state['models']
    provider = state['active_provider']

    try:
        gr.Info(f"Generating wildcards for {path} using {provider}...")
        new_wildcards = api.generate_wildcards(
            provider, api_keys, models, global_prompt,
            path, existing_words, custom_instructions
        )

        updated_wildcards = sorted(list(set(existing_words + new_wildcards)))
        data_node['wildcards'] = updated_wildcards

        gr.Info("Generation complete!")
        return state, gr.update(choices=updated_wildcards, value=updated_wildcards)

    except Exception as e:
        gr.Error(f"Generation failed: {e}")
        return state, gr.update()

def suggest_handler(path, state, suggest_prompt):
    api_keys = state['api_keys']
    models = state['models']
    provider = state['active_provider']

    structure = get_parent_structure_by_path(path, state)

    try:
        gr.Info(f"Asking {provider} for suggestions...")
        suggestions = api.suggest_items(provider, api_keys, models, suggest_prompt, path, structure)

        # Suggestions is list of {name, instruction}
        choices = [f"{s['name']} - {s['instruction']}" for s in suggestions]

        return gr.Accordion(open=True), gr.update(choices=choices, value=[])
    except Exception as e:
        gr.Error(f"Suggestion failed: {e}")
        return gr.update(), gr.update()

def accept_suggestions_handler(selected_suggestions, path, state):
    if not selected_suggestions: return state, gr.update()

    parts = path.split('/') if path else []
    parent_path_parts = parts[:-1]

    parent_node = state['wildcards']
    for part in parent_path_parts:
        parent_node = parent_node.get(part, {})

    added_count = 0
    for item_str in selected_suggestions:
        # Parse "Name - Instruction"
        if " - " in item_str:
            name, instruction = item_str.split(" - ", 1)
        else:
            name = item_str
            instruction = ""

        sanitized_name = name.strip().replace(' ', '_')
        if sanitized_name not in parent_node:
            parent_node[sanitized_name] = {'instruction': instruction, 'wildcards': []}
            added_count += 1

    all_paths = get_all_paths(state['wildcards'])
    gr.Info(f"Added {added_count} new categories.")
    return state, gr.update(choices=all_paths)

def search_handler(term, state):
    paths = get_all_paths(state['wildcards'])
    if not term.strip(): return gr.update(choices=paths)
    filtered = [p for p in paths if term.lower() in p.lower()]
    return gr.update(choices=filtered)

def export_handler(state):
    try:
        yaml_data = reconstruct_yaml_structure(state['wildcards'])

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".yaml", encoding="utf-8") as f:
            yaml.dump(yaml_data, f)
            return gr.update(value=f.name, visible=True)
    except Exception as e:
        gr.Error(f"Export failed: {e}")
        return gr.update()

def save_handler(state):
    try:
        yaml_data = reconstruct_yaml_structure(state['wildcards'])

        base_dir = get_base_dir()
        path = os.path.join(base_dir, 'web', 'data', 'initial-data.yaml')
        with open(path, 'w', encoding='utf-8') as f:
            yaml.dump(yaml_data, f)
        gr.Info(f"Saved to {path}")
    except Exception as e:
        gr.Error(f"Save failed: {e}")

def import_handler(file, state):
    if file is None: return state, gr.update(), gr.update(), gr.update()
    try:
        with open(file.name, 'r', encoding='utf-8') as f:
            yaml_data = yaml.load(f)

        if not yaml_data: return state, gr.update(), gr.update(), gr.update()

        new_wildcards_state = process_ruamel_node(yaml_data)
        state['wildcards'] = new_wildcards_state

        all_paths = get_all_paths(new_wildcards_state)
        first_path = all_paths[0] if all_paths else None
        wildcards = get_wildcards_by_path(first_path, state)

        return state, gr.update(choices=all_paths, value=first_path), gr.update(choices=wildcards, value=wildcards), gr.update(visible=False)
    except Exception as e:
        gr.Error(f"Import failed: {e}")
        return state, gr.update(), gr.update(), gr.update()


# --- UI Construction ---

with gr.Blocks() as demo:
    config = load_config()
    initial_data = load_initial_data()
    # api = Api() # Already global

    initial_paths = get_all_paths(initial_data)

    app_state = gr.State({
        "config": config,
        "wildcards": initial_data,
        "api_keys": {"gemini": "", "openrouter": "", "custom": ""},
        "models": {
            "gemini": config.get('MODEL_NAME_GEMINI', 'gemini-1.5-flash'),
            "openrouter": config.get('MODEL_NAME_OPENROUTER', 'openai/gpt-3.5-turbo'),
            "custom": config.get('MODEL_NAME_CUSTOM', ''),
            "custom_url": config.get('API_URL_CUSTOM', '')
        },
        "active_provider": "gemini"
    })

    gr.Markdown("# Wildcard Generator (Gradio Port)")

    with gr.Accordion("Global Settings", open=False):
        global_prompt_input = gr.Textbox(label="Global System Prompt", value=config.get('DEFAULT_SYSTEM_PROMPT', ''), lines=4)
        suggest_prompt_input = gr.Textbox(label="Suggestion Prompt", value=config.get('DEFAULT_SUGGEST_ITEM_PROMPT', 'Suggest creative categories...'), lines=2)
        with gr.Tabs():
            with gr.TabItem("Gemini") as gemini_tab:
                gemini_api_key_input = gr.Textbox(label="API Key", type="password", placeholder="Enter Gemini API key")
                gemini_model_input = gr.Textbox(label="Model Name", value="gemini-1.5-flash")
            with gr.TabItem("OpenRouter") as openrouter_tab:
                openrouter_api_key_input = gr.Textbox(label="API Key", type="password", placeholder="Enter OpenRouter API key")
                openrouter_model_input = gr.Textbox(label="Model Name", value="openai/gpt-3.5-turbo")
            with gr.TabItem("Custom") as custom_tab:
                custom_url_input = gr.Textbox(label="API URL", placeholder="https://api.example.com/v1")
                custom_api_key_input = gr.Textbox(label="API Key", type="password", placeholder="Optional API Key")
                custom_model_input = gr.Textbox(label="Model Name", placeholder="Model name")

    with gr.Row():
        search_box = gr.Textbox(label="Search Paths", placeholder="Search...", scale=2)
        save_btn = gr.Button("Save Changes to Disk", variant="primary")
        export_yaml_btn = gr.Button("Export YAML")
        import_yaml_btn = gr.UploadButton("Import YAML", file_types=['.yaml', '.yml'])
        download_file = gr.File(label="Download YAML", visible=False)

    gr.Markdown("---")
    gr.Markdown("## Wildcard Editor")

    with gr.Row():
        category_path_dropdown = gr.Dropdown(label="Select Wildcard Category", choices=initial_paths, value=initial_paths[0] if initial_paths else None, scale=2)
        create_cat_btn = gr.Button("New Category", scale=0)
        delete_cat_btn = gr.Button("Delete Category", variant="stop", scale=0)

    wildcard_display_group = gr.CheckboxGroup(label="Wildcards")

    with gr.Accordion("Actions", open=True):
        with gr.Row():
            add_wildcard_input = gr.Textbox(label="Add Wildcard", placeholder="New wildcard...", scale=3)
            add_wildcard_btn = gr.Button("Add")
        with gr.Row():
            delete_selected_btn = gr.Button("Delete Selected")
        with gr.Row():
            generate_btn = gr.Button("Generate More")
            suggest_btn = gr.Button("Suggest Sub-Items")

    with gr.Accordion("Suggestions", open=False) as suggestion_accordion:
        suggestion_output = gr.CheckboxGroup(label="Suggested Categories")
        accept_suggestions_btn = gr.Button("Add Selected Suggestions")

    # --- Event Handlers Wiring ---

    gemini_api_key_input.change(fn=lambda k, m, s: update_settings('gemini', k, m, None, s), inputs=[gemini_api_key_input, gemini_model_input, app_state], outputs=[app_state])
    gemini_model_input.change(fn=lambda k, m, s: update_settings('gemini', k, m, None, s), inputs=[gemini_api_key_input, gemini_model_input, app_state], outputs=[app_state])
    gemini_tab.select(fn=lambda s: update_settings('gemini', s['api_keys']['gemini'], s['models']['gemini'], None, s), inputs=[app_state], outputs=[app_state])

    openrouter_api_key_input.change(fn=lambda k, m, s: update_settings('openrouter', k, m, None, s), inputs=[openrouter_api_key_input, openrouter_model_input, app_state], outputs=[app_state])
    openrouter_model_input.change(fn=lambda k, m, s: update_settings('openrouter', k, m, None, s), inputs=[openrouter_api_key_input, openrouter_model_input, app_state], outputs=[app_state])
    openrouter_tab.select(fn=lambda s: update_settings('openrouter', s['api_keys']['openrouter'], s['models']['openrouter'], None, s), inputs=[app_state], outputs=[app_state])

    custom_api_key_input.change(fn=lambda k, m, u, s: update_settings('custom', k, m, u, s), inputs=[custom_api_key_input, custom_model_input, custom_url_input, app_state], outputs=[app_state])
    custom_model_input.change(fn=lambda k, m, u, s: update_settings('custom', k, m, u, s), inputs=[custom_api_key_input, custom_model_input, custom_url_input, app_state], outputs=[app_state])
    custom_url_input.change(fn=lambda k, m, u, s: update_settings('custom', k, m, u, s), inputs=[custom_api_key_input, custom_model_input, custom_url_input, app_state], outputs=[app_state])
    custom_tab.select(fn=lambda s: update_settings('custom', s['api_keys']['custom'], s['models']['custom'], s['models']['custom_url'], s), inputs=[app_state], outputs=[app_state])


    category_path_dropdown.change(fn=on_path_change, inputs=[category_path_dropdown, app_state], outputs=[wildcard_display_group])
    demo.load(on_path_change, inputs=[category_path_dropdown, app_state], outputs=[wildcard_display_group])

    # To properly support creating categories, let's add an input field that is usually hidden or separate.
    with gr.Accordion("Category Management", open=False):
        new_cat_name = gr.Textbox(label="New Category Path (e.g., parent/child)", placeholder="Enter path...")
        confirm_create_btn = gr.Button("Create Category")

    confirm_create_btn.click(fn=create_category_confirm, inputs=[new_cat_name, app_state], outputs=[app_state, category_path_dropdown])
    create_cat_btn.click(fn=lambda: gr.Accordion(open=True), inputs=None, outputs=None) # Just visual cue

    delete_cat_btn.click(fn=delete_category_handler, inputs=[category_path_dropdown, app_state], outputs=[app_state, category_path_dropdown, category_path_dropdown])


    add_wildcard_btn.click(fn=add_wildcard_handler, inputs=[category_path_dropdown, add_wildcard_input, app_state], outputs=[app_state, wildcard_display_group, add_wildcard_input])

    delete_selected_btn.click(fn=delete_selected_handler, inputs=[category_path_dropdown, wildcard_display_group, app_state], outputs=[app_state, wildcard_display_group])

    generate_btn.click(fn=generate_more_handler, inputs=[category_path_dropdown, app_state, global_prompt_input], outputs=[app_state, wildcard_display_group])

    suggest_btn.click(fn=suggest_handler, inputs=[category_path_dropdown, app_state, suggest_prompt_input], outputs=[suggestion_accordion, suggestion_output])

    accept_suggestions_btn.click(fn=accept_suggestions_handler, inputs=[suggestion_output, category_path_dropdown, app_state], outputs=[app_state, category_path_dropdown])

    search_box.change(fn=search_handler, inputs=[search_box, app_state], outputs=[category_path_dropdown])

    export_yaml_btn.click(fn=export_handler, inputs=[app_state], outputs=[download_file])

    save_btn.click(fn=save_handler, inputs=[app_state], outputs=None)

    import_yaml_btn.upload(fn=import_handler, inputs=[import_yaml_btn, app_state], outputs=[app_state, category_path_dropdown, wildcard_display_group, download_file])

if __name__ == "__main__":
    demo.launch(css_paths=["web/wildcards.css"])
