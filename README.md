# PDF API Translator

Version: 1.0.0

PDF API Translator is a simple Obsidian plugin for translating selected English PDF text into Simplified Chinese with GPT or DeepSeek APIs.

## Features

- Translate selected PDF text from English into Simplified Chinese.
- Popup mode: select text, click the small `Translate` button, and read the result in a floating popup.
- Sidebar mode: click once to enable sidebar translation, then new selections update the sidebar automatically.
- GPT and DeepSeek provider options.
- Optional local domain hint for subject-aware translation.
- Optional glossary entries that are sent only when matched in the selected text.
- In-memory cache to avoid repeating the same API request during one Obsidian session.

## Installation

Download the latest release zip from GitHub, then unzip it into:

```text
<your-vault>/.obsidian/plugins/pdf-api-translator/
```

The folder should contain:

```text
main.js
manifest.json
styles.css
```

Then open Obsidian:

1. Go to `Settings -> Community plugins`.
2. Disable restricted mode if Obsidian asks.
3. Enable `PDF API Translator`.
4. Open the plugin settings.
5. Choose GPT or DeepSeek and enter the corresponding API key.

## Usage

### Popup Mode

Select text in a PDF, then click `Translate`.

The floating result popup can be pinned by holding or dragging it. A pinned popup can show or hide the original text, switch to sidebar mode, or be closed with the close button.

### Sidebar Mode

Switch the display mode to `Sidebar auto`.

The first selection shows the `Translate` button. Click it once to enable automatic sidebar translation. After that, selecting new PDF text updates the sidebar.

## Settings

- `Translation provider`: GPT or DeepSeek.
- `API key`: the key for the selected provider.
- `Model`: model name for the selected provider.
- `Display mode`: popup button or sidebar auto.
- `Maximum selected characters`: selected text length limit.
- `Domain hint`: optional subject-area guidance sent to the model.
- `Glossary`: optional term mappings.

API keys, domain hints, and glossary content are saved only in your local Obsidian plugin settings. Do not commit your vault's plugin `data.json`.

## Glossary Format

Add one entry per line:

```text
source term = preferred translation
```

You can replace the right side with your preferred Chinese translation. Only entries that appear in the selected text are sent to the API.

## Commands

- `PDF API Translator: Open PDF Translator sidebar`
- `PDF API Translator: Enable sidebar mode`
- `PDF API Translator: Translate current selection`
- `PDF API Translator: Test translation API`
