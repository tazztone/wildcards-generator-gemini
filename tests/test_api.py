import pytest
from unittest.mock import MagicMock, patch
import json
import urllib.error
from python_app.api import Api

@pytest.fixture
def api_instance():
    return Api()

@pytest.fixture
def mock_urlopen():
    with patch('urllib.request.urlopen') as mock:
        yield mock

def test_prepare_request_gemini(api_instance):
    api_keys = {'gemini': 'test_key'}
    models = {'gemini': 'test_model'}
    url, headers, payload = api_instance._prepare_request('gemini', api_keys, models, 'global', 'user')

    assert 'generativelanguage.googleapis.com' in url
    assert 'key=test_key' in url
    assert 'test_model' in url
    assert payload['contents'][0]['parts'][0]['text'] == 'global'

def test_prepare_request_openrouter(api_instance):
    api_keys = {'openrouter': 'test_key'}
    models = {'openrouter': 'test_model'}
    url, headers, payload = api_instance._prepare_request('openrouter', api_keys, models, 'global', 'user')

    assert 'openrouter.ai' in url
    assert headers['Authorization'] == 'Bearer test_key'
    assert payload['model'] == 'test_model'

def test_prepare_request_custom(api_instance):
    api_keys = {'custom': 'test_key'}
    models = {'custom': 'test_model', 'custom_url': 'https://custom.api/v1'}
    url, headers, payload = api_instance._prepare_request('custom', api_keys, models, 'global', 'user')

    assert url == 'https://custom.api/v1/chat/completions'
    assert headers['Authorization'] == 'Bearer test_key'
    assert payload['model'] == 'test_model'

def test_prepare_request_missing_keys(api_instance):
    with pytest.raises(ValueError, match="Gemini API key not provided"):
        api_instance._prepare_request('gemini', {}, {}, '', '')

def test_generate_wildcards_gemini_success(api_instance, mock_urlopen):
    # Mock response
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({
        'candidates': [{
            'content': {
                'parts': [{'text': '["wildcard1", "wildcard2"]'}]
            }
        }]
    }).encode('utf-8')
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = api_instance.generate_wildcards(
        'gemini', {'gemini': 'k'}, {'gemini': 'm'},
        'global', 'path', ['exist'], 'inst'
    )

    assert result == ["wildcard1", "wildcard2"]

def test_generate_wildcards_openrouter_success(api_instance, mock_urlopen):
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({
        'choices': [{
            'message': {
                'content': '["wildcard1", "wildcard2"]'
            }
        }]
    }).encode('utf-8')
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = api_instance.generate_wildcards(
        'openrouter', {'openrouter': 'k'}, {'openrouter': 'm'},
        'global', 'path', ['exist'], 'inst'
    )

    assert result == ["wildcard1", "wildcard2"]

def test_generate_wildcards_api_error(api_instance, mock_urlopen):
    # Simulate HTTP Error
    mock_urlopen.side_effect = urllib.error.HTTPError(
        'url', 500, 'Internal Server Error', {}, None
    )
    # Mock read() for error body
    mock_urlopen.side_effect.read = MagicMock(return_value=b'Error details')

    with pytest.raises(Exception, match="API request failed with status 500"):
        api_instance.generate_wildcards(
            'gemini', {'gemini': 'k'}, {'gemini': 'm'},
            'global', 'path', [], ''
        )

def test_suggest_items_gemini_success(api_instance, mock_urlopen):
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.read.return_value = json.dumps({
        'candidates': [{
            'content': {
                'parts': [{'text': '[{"name": "cat1", "instruction": "inst1"}]'}]
            }
        }]
    }).encode('utf-8')
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = api_instance.suggest_items(
        'gemini', {'gemini': 'k'}, {'gemini': 'm'},
        'prompt', 'path', ['sib1']
    )

    assert result == [{"name": "cat1", "instruction": "inst1"}]
