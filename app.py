import gradio as gr
import yaml
import json
import urllib.request
import urllib.error
import tempfile

class Api:
    # ... (Api class from before - assuming it's here)
    def _prepare_request(self, provider, api_keys, models, global_prompt, user_prompt):
        headers = {'Content-Type': 'application/json'}
        payload = {}
        url = ""

        if provider == 'gemini':
            api_key = api_keys.get('gemini')
            model = models.get('gemini', 'gemini-1.5-flash')
            if not api_key:
                raise ValueError("Gemini API key not provided in settings.")

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [
                    {"role": "user", "parts": [{"text": global_prompt}]},
                    {"role": "model", "parts": [{"text": "Understood."}]},
                    {"role": "user", "parts": [{"text": user_prompt}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {"type": "ARRAY", "items": {"type": "STRING"}}
                }
            }
        else:
            raise ValueError(f"Provider '{provider}' is not implemented yet.")

        return url, headers, payload

    def generate_wildcards(self, provider, api_keys, models, global_prompt, category_path, existing_words, custom_instructions):
        readable_path = category_path.replace('/', ' > ').replace('_', ' ')
        user_prompt = f"Category Path: '{readable_path}'\nExisting Wildcards: {', '.join(existing_words[:50])}\nCustom Instructions: \"{custom_instructions.strip()}\""

        url, headers, payload = self._prepare_request(provider, api_keys, models, global_prompt, user_prompt)

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status != 200:
                    raise urllib.error.HTTPError(url, response.status, "API request failed", response.headers, response.fp)

                response_body = response.read().decode('utf-8')
                response_json = json.loads(response_body)

                if response_json.get('candidates'):
                    part_text = response_json['candidates'][0]['content']['parts'][0]['text']
                    return json.loads(part_text)
                else:
                    raise Exception("Invalid response from Gemini API: 'candidates' key not found.")

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise Exception(f"API request failed with status {e.code}: {error_body}")
        except Exception as e:
            raise Exception(f"An error occurred during API call: {e}")

def process_yaml_node(node):
    if isinstance(node, list):
        return {'instruction': '', 'wildcards': sorted([str(v) for v in node])}
    if isinstance(node, dict):
        return {k: process_yaml_node(v) for k, v in node.items()}
    if node is None:
        return {}
    return {'instruction': '', 'wildcards': [str(node)]}

def load_initial_data():
    with open('initial-data.yaml', 'r', encoding='utf-8') as f:
        yaml_data = yaml.safe_load(f)
    return {k: process_yaml_node(v) for k, v in yaml_data.items()}

def load_config():
    with open('config.json', 'r') as f:
        return json.load(f)

def get_all_paths(wildcard_data, parent_path=""):
    paths = []
    for key, value in wildcard_data.items():
        current_path = f"{parent_path}/{key}" if parent_path else key
        if 'wildcards' in value and isinstance(value['wildcards'], list):
            paths.append(current_path)
        elif isinstance(value, dict) and value:
            paths.extend(get_all_paths(value, current_path))
    return sorted(paths)

def get_data_by_path(path, state):
    if not path: return None
    parts = path.split('/')
    data = state['wildcards']
    for part in parts:
        data = data.get(part, {})
    return data

def get_wildcards_by_path(path, state):
    if not path: return []
    data_node = get_data_by_path(path, state)
    return data_node.get('wildcards', [])

with gr.Blocks() as demo:
    config = load_config()
    initial_data = load_initial_data()
    api = Api()

    initial_paths = get_all_paths(initial_data)

    app_state = gr.State({
        "config": config,
        "wildcards": initial_data,
        "history": [],
        "history_index": -1,
        "api_keys": {"gemini": "", "openrouter": "", "custom": ""}
    })

    gr.Markdown("# Wildcard Generator (Gradio Port)")

    with gr.Accordion("Global Settings", open=False):
        global_prompt_input = gr.Textbox(label="Global System Prompt", value=config.get('DEFAULT_SYSTEM_PROMPT', ''), lines=4)
        with gr.Tabs():
            with gr.TabItem("Gemini"):
                gemini_api_key_input = gr.Textbox(label="API Key", type="password", placeholder="Enter Gemini API key")

    with gr.Row():
        search_box = gr.Textbox(label="Search Paths", placeholder="Search...", scale=2)
        export_yaml_btn = gr.Button("Export YAML")
        import_yaml_btn = gr.UploadButton("Import YAML", file_types=['.yaml', '.yml'])
        download_file = gr.File(label="Download YAML", visible=False)

    gr.Markdown("---")
    gr.Markdown("## Wildcard Editor")

    category_path_dropdown = gr.Dropdown(label="Select Wildcard Category", choices=initial_paths, value=initial_paths[0] if initial_paths else None)
    wildcard_display_group = gr.CheckboxGroup(label="Wildcards")

    with gr.Accordion("Actions", open=True):
        with gr.Row():
            add_wildcard_input = gr.Textbox(label="Add Wildcard", placeholder="New wildcard...", scale=3)
            add_wildcard_btn = gr.Button("Add")
        with gr.Row():
            delete_selected_btn = gr.Button("Delete Selected")
        with gr.Row():
            generate_btn = gr.Button("Generate More")

    # --- Event Handlers ---
    def update_api_key(key, state):
        state['api_keys']['gemini'] = key
        return state
    gemini_api_key_input.change(fn=update_api_key, inputs=[gemini_api_key_input, app_state], outputs=[app_state])

    def on_path_change(path, state):
        data_node = get_data_by_path(path, state)
        wildcards = data_node.get('wildcards', [])
        return gr.update(choices=wildcards, value=wildcards)
    category_path_dropdown.change(fn=on_path_change, inputs=[category_path_dropdown, app_state], outputs=[wildcard_display_group])
    demo.load(on_path_change, inputs=[category_path_dropdown, app_state], outputs=[wildcard_display_group])

    def add_wildcard_handler(path, new_wildcard, state):
        if not path or not new_wildcard.strip(): return state, gr.update(), gr.update()
        data_node = get_data_by_path(path, state)
        if not data_node: return state, gr.update(), gr.update()
        wildcards = data_node.get('wildcards', [])
        wildcards.append(new_wildcard.strip())
        data_node['wildcards'] = sorted(list(set(wildcards)))
        return state, gr.update(choices=data_node['wildcards'], value=data_node['wildcards']), gr.update(value="")
    add_wildcard_btn.click(fn=add_wildcard_handler, inputs=[category_path_dropdown, add_wildcard_input, app_state], outputs=[app_state, wildcard_display_group, add_wildcard_input])

    def delete_selected_handler(path, selected, state):
        if not path or not selected: return state, gr.update()
        data_node = get_data_by_path(path, state)
        if not data_node: return state, gr.update()
        current = data_node.get('wildcards', [])
        updated = [w for w in current if w not in selected]
        data_node['wildcards'] = updated
        return state, gr.update(choices=updated, value=updated)
    delete_selected_btn.click(fn=delete_selected_handler, inputs=[category_path_dropdown, wildcard_display_group, app_state], outputs=[app_state, wildcard_display_group])

    def generate_more_handler(path, state, global_prompt):
        if not path:
            gr.Warning("No category selected!")
            return state, gr.update()

        data_node = get_data_by_path(path, state)
        if not data_node:
            gr.Warning("Could not find data for the selected path.")
            return state, gr.update()

        existing_words = data_node.get('wildcards', [])
        custom_instructions = data_node.get('instruction', '')

        api_keys = state['api_keys']
        models = {'gemini': state['config'].get('MODEL_NAME_GEMINI', 'gemini-1.5-flash')}
        provider = "gemini"

        try:
            gr.Info(f"Generating wildcards for {path}...")
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
    generate_btn.click(fn=generate_more_handler, inputs=[category_path_dropdown, app_state, global_prompt_input], outputs=[app_state, wildcard_display_group])

    def search_handler(term, state):
        paths = get_all_paths(state['wildcards'])
        if not term.strip(): return gr.update(choices=paths)
        filtered = [p for p in paths if term.lower() in p.lower()]
        return gr.update(choices=filtered)
    search_box.change(fn=search_handler, inputs=[search_box, app_state], outputs=[category_path_dropdown])

    def export_handler(state):
        def unprocess_node(node):
            if 'wildcards' in node: return node['wildcards']
            return {k: unprocess_node(v) for k, v in node.items()}

        yaml_data = {k: unprocess_node(v) for k, v in state['wildcards'].items()}
        yaml_string = yaml.dump(yaml_data, indent=2, allow_unicode=True)

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".yaml", encoding="utf-8") as f:
            f.write(yaml_string)
            return gr.update(value=f.name, visible=True)
    export_yaml_btn.click(fn=export_handler, inputs=[app_state], outputs=[download_file])

    def import_handler(file, state):
        if file is None: return state, gr.update(), gr.update(), gr.update()
        with open(file.name, 'r', encoding='utf-8') as f:
            new_yaml_data = yaml.safe_load(f)

        new_wildcards_state = {k: process_yaml_node(v) for k, v in new_yaml_data.items()}
        state['wildcards'] = new_wildcards_state

        all_paths = get_all_paths(new_wildcards_state)
        first_path = all_paths[0] if all_paths else None
        wildcards = get_wildcards_by_path(first_path, state)

        return state, gr.update(choices=all_paths, value=first_path), gr.update(choices=wildcards, value=wildcards), gr.update(visible=False)
    import_yaml_btn.upload(fn=import_handler, inputs=[import_yaml_btn, app_state], outputs=[app_state, category_path_dropdown, wildcard_display_group, download_file])

if __name__ == "__main__":
    demo.launch(css_paths="wildcards.css")