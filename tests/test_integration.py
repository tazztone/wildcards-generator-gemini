import pytest
from unittest.mock import MagicMock, patch
import python_app.app as app
import gradio as gr

@pytest.fixture
def mock_state():
    return {
        "wildcards": {
            "Category": {
                "instruction": "Test instruction",
                "wildcards": ["item1", "item2"]
            },
            "EmptyCat": {
                "instruction": "",
                "wildcards": []
            }
        },
        "api_keys": {},
        "models": {}
    }

def test_add_wildcard_handler(mock_state):
    # Test adding a valid wildcard
    new_state, update_grp, update_input = app.add_wildcard_handler("Category", "newItem", mock_state)

    assert "newItem" in new_state['wildcards']['Category']['wildcards']
    assert len(new_state['wildcards']['Category']['wildcards']) == 3
    # Check that it returns gr.update with new choices
    # Gradio updates are dicts or objects depending on version, but usually we can check properties if we know internal structure
    # or just check it's not None.
    assert update_grp is not None

def test_add_wildcard_handler_empty(mock_state):
    # Test adding empty string
    new_state, update_grp, update_input = app.add_wildcard_handler("Category", "   ", mock_state)
    assert len(new_state['wildcards']['Category']['wildcards']) == 2 # No change

def test_delete_category_handler_leaf(mock_state):
    # Delete leaf category "Category"
    new_state, update_dropdown, update_val = app.delete_category_handler("Category", mock_state)
    assert "Category" not in new_state['wildcards']
    assert "EmptyCat" in new_state['wildcards']

def test_delete_category_handler_nested():
    state = {
        "wildcards": {
            "Parent": {
                "Child": {
                    "instruction": "",
                    "wildcards": []
                }
            }
        }
    }
    new_state, _, _ = app.delete_category_handler("Parent/Child", state)
    assert "Child" not in new_state['wildcards']['Parent']
    assert "Parent" in new_state['wildcards']

def test_create_category_confirm(mock_state):
    new_state, update = app.create_category_confirm("New/Category", mock_state)
    assert "New" in new_state['wildcards']
    assert "Category" in new_state['wildcards']['New']

def test_delete_selected_handler(mock_state):
    new_state, update = app.delete_selected_handler("Category", ["item1"], mock_state)
    assert "item1" not in new_state['wildcards']['Category']['wildcards']
    assert "item2" in new_state['wildcards']['Category']['wildcards']

def test_search_handler(mock_state):
    # "Category" and "EmptyCat" are paths
    update = app.search_handler("Empty", mock_state)
    # update is a dict-like object for Gradio components
    # In newer Gradio versions, it returns an object. Let's check if we can inspect it.
    # If it returns a dict (legacy), we can check keys.
    # app.py code: return gr.update(choices=filtered)
    # We can inspect the returned value.
    # For now, let's assume it returns something truthy.
    assert update is not None

@patch('python_app.app.api')
def test_generate_more_handler(mock_api, mock_state):
    mock_api.generate_wildcards.return_value = ["gen1", "gen2"]

    mock_state['active_provider'] = 'gemini'

    # Need to patch gr.Info and gr.Error to avoid side effects or errors during test
    with patch('gradio.Info'), patch('gradio.Warning'):
        new_state, update = app.generate_more_handler("Category", mock_state, "prompt")

        assert "gen1" in new_state['wildcards']['Category']['wildcards']
        assert "gen2" in new_state['wildcards']['Category']['wildcards']
        mock_api.generate_wildcards.assert_called_once()

@patch('python_app.app.api')
def test_suggest_handler(mock_api, mock_state):
    mock_api.suggest_items.return_value = [{'name': 'NewCat', 'instruction': 'Do this'}]
    mock_state['active_provider'] = 'gemini'

    with patch('gradio.Info'):
        accordion_update, checkbox_update = app.suggest_handler("Category", mock_state, "prompt")

        mock_api.suggest_items.assert_called_once()
        # checkbox_update choices should contain the suggestion
        # Since we can't easily inspect Gradio update objects without internals, we assume success if no error raised

def test_accept_suggestions_handler(mock_state):
    suggestions = ["NewCat - New instruction"]
    path = "Category" # Parent path? logic says "siblings of path" or similar

    # In app.py:
    # parts = path.split('/') if path else []
    # parent_path_parts = parts[:-1]
    # So if path="Category", parent is root.

    with patch('gradio.Info'):
        new_state, update = app.accept_suggestions_handler(suggestions, path, mock_state)

        assert "NewCat" in new_state['wildcards']
        assert new_state['wildcards']['NewCat']['instruction'] == "New instruction"
