import json
import yaml
import os
from typing import Dict, List, Any

# --- CONFIGURATION ---
# Set to True to use internal sample data (no downloads needed).
# Set to False once you have downloaded the real metadata files.
USE_MOCK_DATA = True

PATHS = {
    "imagenet": "data/imagenet_class_index.json",
    "places365": "data/categories_places365.txt",
    "output": "taxonomy_skeleton.yaml"
}

# --- MOCK DATA GENERATORS (For Testing) ---
def get_mock_imagenet():
    """Simulates the structure of imagenet_class_index.json"""
    return {
        "0": ["n02119789", "kit_fox"],
        "1": ["n02100735", "English_setter"],
        "2": ["n00000000", "dummy_entry"],
        "3": ["n02123045", "tabby_cat"],
        "4": ["n02123159", "tiger_cat"]
    }

def get_mock_places365():
    """Simulates categories_places365.txt"""
    return [
        "/a/airfield",
        "/a/airplane_cabin",
        "/b/bedroom",
        "/b/bar",
        "/k/kitchen",
        "/f/forest/broadleaf"
    ]

# --- PARSING LOGIC ---

def build_imagenet_hierarchy(data: Dict[str, List[str]]) -> Dict[str, Any]:
    """
    Parses ImageNet dictionary.
    REAL WORLD: Requires querying WordNet to get parent categories (e.g., Tabby -> Feline).
    MVP: Flattens them under a general 'objects' key for now.
    """
    hierarchy = {"objects": {"animals": []}}

    print(f"Processing {len(data)} ImageNet classes...")

    for key, value in data.items():
        # ImageNet json format: "0": ["n012345", "label"]
        if len(value) > 1:
            label = value[1].replace("_", " ")

            # In a real WordNet implementation, we would determine if this is a dog, cat, or vehicle.
            # For this scaffold, we categorize naively.
            hierarchy["objects"]["animals"].append(label)

    return hierarchy

def build_places365_hierarchy(lines: List[str]) -> Dict[str, Any]:
    """
    Parses Places365 paths (e.g., /f/forest/broadleaf) into nested dictionaries.
    """
    hierarchy = {"locations": {}}

    print(f"Processing {len(lines)} Places365 categories...")

    for line in lines:
        # Remove leading slash and split
        parts = line.strip().strip('/').split('/')

        # logic to nest: locations -> part -> part...[1]
        current_level = hierarchy["locations"]

        # Use the first letter folder (like 'a') as a grouper, or skip it?
        # Let's skip the single letter folders (parts) for cleaner YAML
        categories = parts[1:] # ['forest', 'broadleaf']

        for i, category in enumerate(categories):
            category = category.replace("_", " ")

            # If we are at the last item, it's a leaf node (list item)
            if i == len(categories) - 1:
                if "options" not in current_level:
                    current_level["options"] = []
                # If current_level is a dict (folder), add to a special list inside it
                # Note: This is a simplification. Ideally, we want consistent structure.
                current_level["options"].append(category)
            else:
                if category not in current_level:
                    current_level[category] = {}
                current_level = current_level[category]

        # Simple Flat Append for the scaffold to demonstrate structure
        # A robust implementation requires recursive tree building

    # Simplified return for the Scaffold demo:
    return {"locations": {"places_list": [x.split('/')[-1] for x in lines]}}


def merge_taxonomies(taxonomies: List) -> Dict:
    master = {}
    for tax in taxonomies:
        master.update(tax)
    return master

# --- MAIN EXECUTION ---
def main():
    # 1. Load Data
    if USE_MOCK_DATA:
        print("--- RUNNING IN MOCK MODE ---")
        imagenet_data = get_mock_imagenet()
        places_lines = get_mock_places365()
    else:
        # This code block will run when you have real files
        if os.path.exists(PATHS["imagenet"]):
            with open(PATHS["imagenet"], 'r') as f:
                imagenet_data = json.load(f)
        else:
            print(f"Missing {PATHS['imagenet']}")
            return

        if os.path.exists(PATHS["places365"]):
            with open(PATHS["places365"], 'r') as f:
                places_lines = f.readlines()
        else:
            print(f"Missing {PATHS['places365']}")
            return

    # 2. Build Hierarchies
    tax_1 = build_imagenet_hierarchy(imagenet_data)
    tax_2 = build_places365_hierarchy(places_lines)

    # 3. Merge
    master_taxonomy = merge_taxonomies([tax_1, tax_2])

    # 4. Output YAML
    with open(PATHS["output"], 'w', encoding='utf-8') as f:
        # default_flow_style=False forces block format (lists with dashes)
        yaml.dump(master_taxonomy, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print(f"\nSuccess! Skeleton taxonomy generated at: {os.path.abspath(PATHS['output'])}")
    print("Open this file to verify the YAML structure.")

if __name__ == "__main__":
    main()
