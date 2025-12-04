import pytest
from app import process_ruamel_node, get_all_paths, get_data_by_path, get_parent_structure_by_path
from ruamel.yaml import YAML

yaml = YAML()

def test_process_ruamel_node_simple_list():
    data = ["item1", "item2"]
    result = process_ruamel_node(data)
    assert result == {'instruction': '', 'wildcards': ["item1", "item2"]}

def test_process_ruamel_node_simple_dict():
    data = {"key": "value"}
    result = process_ruamel_node(data)
    assert result == {'key': {'instruction': '', 'wildcards': ['value']}}

def test_process_ruamel_node_nested_dict():
    data = {"category": {"subcategory": ["item1"]}}
    result = process_ruamel_node(data)
    assert result['category']['subcategory'] == {'instruction': '', 'wildcards': ["item1"]}

def test_process_ruamel_node_with_comments():
    yaml_content = """
    category: # instruction: Use specific style
      - item1
    """
    data = yaml.load(yaml_content)
    result = process_ruamel_node(data)
    assert result['category']['instruction'] == "Use specific style"

def test_get_all_paths():
    data = {
        'cat1': {'instruction': '', 'wildcards': ['a']},
        'cat2': {
            'sub1': {'instruction': '', 'wildcards': ['b']},
            'sub2': {'instruction': '', 'wildcards': ['c']}
        }
    }
    paths = get_all_paths(data)
    assert sorted(paths) == sorted(['cat1', 'cat2/sub1', 'cat2/sub2'])

def test_get_data_by_path():
    data = {
        'cat1': {'instruction': '', 'wildcards': ['a']},
        'cat2': {
            'sub1': {'instruction': '', 'wildcards': ['b']}
        }
    }
    node = get_data_by_path('cat2/sub1', {'wildcards': data})
    assert node['wildcards'] == ['b']

    node = get_data_by_path('cat1', {'wildcards': data})
    assert node['wildcards'] == ['a']

    node = get_data_by_path('invalid', {'wildcards': data})
    assert node == {}

def test_get_parent_structure_by_path():
    data = {
        'cat1': {'instruction': '', 'wildcards': ['a']},
        'cat2': {
            'sub1': {'instruction': '', 'wildcards': ['b']},
            'sub2': {'instruction': '', 'wildcards': ['c']}
        }
    }
    state = {'wildcards': data}

    # Test top level
    keys = get_parent_structure_by_path('', state)
    assert sorted(keys) == sorted(['cat1', 'cat2'])

    # Test second level
    keys = get_parent_structure_by_path('cat2/sub1', state)
    assert sorted(keys) == sorted(['sub1', 'sub2'])
