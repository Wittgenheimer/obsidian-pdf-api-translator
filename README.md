# PDF API Translator Modular

Version: 0.1.1

This is a modular rewrite of the PDF API Translator Obsidian plugin.

## Architecture

The plugin follows a strict isolation model:

- Core modules provide shared city services: selection, settings, and AI API access.
- PublicActionWindow is only the public selection action window. It collects action cards and runs card callbacks.
- TranslateFeature owns translation prompts, glossary handling, popup translation, sidebar translation, and translation requests.
- SaveFeature owns note targets, note picker modal, open modes, and writing selected text.
- Services wrap Obsidian vault/workspace utilities.

Feature modules do not call each other. They only use shared core/services or submit cards to the public window.

## Files

```text
main.js
styles.css
manifest.json
src/
  core/
  services/
  features/
    public-window/
    translate/
    save/
  ui/
```

## Install

Copy this folder into:

```text
<vault>/.obsidian/plugins/pdf-api-translator-modular
```

Then enable `PDF API Translator Modular` in Obsidian community plugins.

API keys and personal prompt settings are stored only in Obsidian plugin data, not in this repository.
