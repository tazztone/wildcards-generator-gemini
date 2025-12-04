import json
import urllib.request
import urllib.error

class Api:
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
        elif provider == 'openrouter':
            api_key = api_keys.get('openrouter')
            model = models.get('openrouter', 'openai/gpt-3.5-turbo') # Default or user selected
            if not api_key:
                raise ValueError("OpenRouter API key not provided in settings.")

            url = "https://openrouter.ai/api/v1/chat/completions"
            headers['Authorization'] = f"Bearer {api_key}"
            payload = {
                "model": model,
                "messages": [
                     {"role": "user", "content": f"{global_prompt}\n\n{user_prompt}"}
                ],
                "response_format": { "type": "json_object" }
            }
        elif provider == 'custom':
            api_key = api_keys.get('custom')
            model = models.get('custom', '')
            base_url = models.get('custom_url', '')
            if not base_url:
                raise ValueError("Custom API URL not provided in settings.")

            url = f"{base_url.rstrip('/')}/chat/completions"
            if api_key:
                headers['Authorization'] = f"Bearer {api_key}"

            payload = {
                "model": model,
                "messages": [
                     {"role": "user", "content": f"{global_prompt}\n\n{user_prompt}"}
                ],
                "response_format": { "type": "json_object" }
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

                if provider == 'gemini':
                    if response_json.get('candidates'):
                        part_text = response_json['candidates'][0]['content']['parts'][0]['text']
                        return json.loads(part_text)
                    else:
                        raise Exception("Invalid response from Gemini API: 'candidates' key not found.")
                elif provider in ['openrouter', 'custom']:
                     if response_json.get('choices'):
                        content_str = response_json['choices'][0]['message']['content']
                        # Try to handle potential markdown code blocks
                        if "```" in content_str:
                             import re
                             match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content_str)
                             if match:
                                 content_str = match.group(1)

                        content = json.loads(content_str)
                        if isinstance(content, list):
                            return content
                        elif isinstance(content, dict):
                            # Handle { "wildcards": [...] } or similar wrappers
                             for key in ['wildcards', 'items', 'categories']:
                                 if key in content and isinstance(content[key], list):
                                     return content[key]
                             # If just values are list
                             for val in content.values():
                                 if isinstance(val, list):
                                     return val
                        return [] # Fallback
                     else:
                         raise Exception(f"Invalid response from {provider} API.")

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise Exception(f"API request failed with status {e.code}: {error_body}")
        except Exception as e:
            raise Exception(f"An error occurred during API call: {e}")

    def suggest_items(self, provider, api_keys, models, suggest_prompt, parent_path, structure):
        readable_path = parent_path.replace('/', ' > ').replace('_', ' ') if parent_path else 'Top-Level'
        global_prompt = suggest_prompt.replace('{parentPath}', readable_path)
        user_prompt = f"For context, here are the existing sibling items at the same level:\n{json.dumps(structure, indent=2)}\n\nPlease provide new suggestions for the '{readable_path}' category. Return a JSON array of objects with 'name' and 'instruction' keys."

        # We need to tweak _prepare_request or manually construct payload because response schema is different
        # For simplicity, we'll assume the model follows instructions or we force JSON mode if supported

        url, headers, payload = self._prepare_request(provider, api_keys, models, global_prompt, user_prompt)

        # Override Gemini schema for suggestions
        if provider == 'gemini':
             payload['generationConfig']['responseSchema'] = {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": { "type": "STRING" },
                        "instruction": { "type": "STRING" }
                    },
                    "required": ["name", "instruction"]
                }
            }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                response_body = response.read().decode('utf-8')
                response_json = json.loads(response_body)

                if provider == 'gemini':
                     part_text = response_json['candidates'][0]['content']['parts'][0]['text']
                     return json.loads(part_text)
                elif provider in ['openrouter', 'custom']:
                     content_str = response_json['choices'][0]['message']['content']
                     if "```" in content_str:
                         import re
                         match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content_str)
                         if match: content_str = match.group(1)
                     content = json.loads(content_str)
                     if isinstance(content, list): return content
                     if isinstance(content, dict):
                         for key in ['items', 'suggestions', 'categories']:
                             if key in content and isinstance(content[key], list): return content[key]
                     return []

        except Exception as e:
            raise Exception(f"Suggestion API call failed: {e}")
