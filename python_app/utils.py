import os
import json
from ruamel.yaml import YAML

# Use ruamel.yaml for comment preservation
yaml = YAML()
yaml.preserve_quotes = True
# Configure indentation for consistent output
yaml.indent(mapping=2, sequence=4, offset=2)

def get_base_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def process_ruamel_node(node, parent_comments=None):
    """
    Recursively process ruamel object to extract structure and comments.
    """
    processed = {}

    # Handling list leaf nodes
    if isinstance(node, list):
        return {'instruction': '', 'wildcards': sorted([str(v) for v in node])}

    if isinstance(node, dict):
        for k, v in node.items():
            child_processed = process_ruamel_node(v)

            # Extract comment for this key from the parent node's comment attribute
            comment = ''
            if hasattr(node, 'ca') and node.ca.items and k in node.ca.items:
                # node.ca.items[k] is a list: [None, None, CommentToken, None]
                # Index 2 is usually the end-of-line comment
                token = node.ca.items[k][2]
                if token:
                    comment_val = token.value.strip() # "# instruction: ..."
                    # Remove the '# instruction:' prefix if present to store just the value
                    if comment_val.startswith('# instruction:'):
                        comment = comment_val.replace('# instruction:', '', 1).strip()
                    elif comment_val.startswith('#'):
                        comment = comment_val.replace('#', '', 1).strip()

            if isinstance(child_processed, dict):
                # If child is a dict (category), attach instruction
                child_processed['instruction'] = comment

            processed[k] = child_processed

        return processed

    return {'instruction': '', 'wildcards': [str(node)]}

def load_initial_data():
    base_dir = get_base_dir()
    path = os.path.join(base_dir, 'web', 'data', 'initial-data.yaml')
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            yaml_data = yaml.load(f)
        if not yaml_data:
            return {}

        # Process the ruamel structure into our internal app state structure
        # The top-level object is a CommentedMap, so we process it like a dict
        return process_ruamel_node(yaml_data)

    except Exception as e:
        print(f"Error loading initial-data.yaml: {e}")
        return {}

def load_config():
    base_dir = get_base_dir()
    path = os.path.join(base_dir, 'web', 'config.json')
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def get_all_paths(wildcard_data, parent_path=""):
    paths = []
    for key, value in wildcard_data.items():
        if key == 'instruction': continue
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

# Helper to get parent object structure for suggestions context
def get_parent_structure_by_path(path, state):
    # If path is top level or empty, return top level keys
    if not path: return list(state['wildcards'].keys())

    parts = path.split('/')
    if len(parts) == 1:
        # Parent is root
        return list(state['wildcards'].keys())

    parent_path = '/'.join(parts[:-1])
    parent_data = get_data_by_path(parent_path, state)
    # Return keys of siblings
    return list(parent_data.keys()) if parent_data else []

def reconstruct_yaml_structure(node):
    """
    Reconstructs the Ruamel CommentedMap structure from the internal state for saving.
    """
    if 'wildcards' in node:
        # Leaf node: return list
        # Create sequence
        l = yaml.seq(node['wildcards'])
        return l
    else:
        # Dict node
        m = yaml.map()
        for k, v in node.items():
            if k == 'instruction': continue
            m[k] = reconstruct_yaml_structure(v)
            # Attach instruction if present
            if isinstance(v, dict) and 'instruction' in v and v['instruction']:
                m.yaml_add_eol_comment(f"instruction: {v['instruction']}", k)
        return m
