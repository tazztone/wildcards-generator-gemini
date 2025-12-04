from python_app.utils import reconstruct_yaml_structure
from ruamel.yaml import YAML

yaml = YAML()

def test_reconstruct_yaml_structure_list():
    data = {'wildcards': ['item1', 'item2'], 'instruction': ''}
    result = reconstruct_yaml_structure(data)
    # result should be a ruamel CommentedSeq
    assert list(result) == ['item1', 'item2']

def test_reconstruct_yaml_structure_dict():
    data = {
        'cat1': {'wildcards': ['item1'], 'instruction': 'inst1'},
        'instruction': ''
    }
    result = reconstruct_yaml_structure(data)
    # result should be CommentedMap
    assert result['cat1'][0] == 'item1'
    # Checking for comment requires inspecting internal structure or dumping
    # Let's verify dump output contains comment
    import io
    stream = io.StringIO()
    yaml.dump(result, stream)
    assert "# instruction: inst1" in stream.getvalue()
