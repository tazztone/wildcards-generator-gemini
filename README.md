When you click the "Generate More" button for a specific category, a multi-step process is triggered to communicate with the AI. Here’s a breakdown:

1.  **Data Collection:** The JavaScript code first gathers all the necessary context from the page:

      * **The Global System Prompt:** It reads the main instructions from the editable text area at the top of the page.
      * **Category Context:** It identifies the main category (e.g., "1. Subject & Content") and the specific sub-category you clicked on (e.g., "People\_Occupation\_Modern").
      * **Custom Instructions:** It takes the text you wrote in the "Custom instructions" field for that specific card (e.g., "Focus on niche, futuristic, or internet-related jobs.").
      * **Existing Wildcards:** It gets the current list of wildcards already in that category to prevent the AI from sending duplicates.

2.  **API Call Construction:** All this information is then assembled into a structured request (a JSON payload) to be sent to the Google Gemini API. Here is an example of what that payload looks like for the "People\_Occupation\_Modern" category:

    ```json
    {
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "You are a creative assistant for generating wildcards for AI image prompts. You will be given a main category, a sub-category, a list of existing wildcards, and optional custom instructions. Your task is to generate 20 more diverse and creative wildcards that fit the sub-category. Do not repeat any from the existing list. Follow all custom instructions. Return ONLY the new wildcards as a JSON array of strings."
            }
          ]
        },
        {
          "role": "model",
          "parts": [
            {
              "text": "Understood. I am ready to generate wildcards based on your instructions."
            }
          ]
        },
        {
          "role": "user",
          "parts": [
            {
              "text": "Main Category: '1_Subject_Content'\nSub-Category: 'People_Occupation_Modern'\nExisting Wildcards: Astronaut, Doctor, Programmer, CEO, DJ, Influencer, Scientist, Urban Explorer, Chef, Fire-fighter, Barista, Urban Farmer, Journalist, Mechanic, Pilot, Software Engineer, Data Scientist, Biotech Researcher, Ethical Hacker, Drone Pilot\nCustom Instructions: \"Focus on niche, futuristic, or internet-related jobs.\""
            }
          ]
        }
      ],
      "generationConfig": {
        "responseMimeType": "application/json",
        "responseSchema": {
          "type": "ARRAY",
          "items": { "type": "STRING" }
        }
      }
    }
    ```

3.  **Receiving & Processing the Response:** The AI processes this request and sends back a list of new wildcards. The application then filters out any that might already exist (just in case) and adds the new, unique ones to the list.

4.  **UI Update:** Finally, the card on the webpage is updated to display the new wildcards as editable chips.

