const {
  ItemView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl
} = require("obsidian");

const VIEW_TYPE = "pdf-api-translator-view";

const DEFAULT_SETTINGS = {
  provider: "openai",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  direction: "enToZh",
  domainHint: "",
  glossary: "",
  displayMode: "popup",
  popupButtonMode: true,
  sidebarAutoMode: false,
  maxCharacters: 3000
};

class TranslatorView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentSource = "";
    this.currentTranslation = "";
    this.currentPending = false;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "PDF Translator";
  }

  getIcon() {
    return "languages";
  }

  async onOpen() {
    this.render();
    window.setTimeout(() => this.render(), 100);
  }

  render() {
    const container = this.getContentContainer();
    const previousRoot = container.querySelector(".pdf-api-translator-view-root");
    if (previousRoot) previousRoot.remove();

    const root = document.createElement("div");
    root.className = "pdf-api-translator-view-root pdf-api-translator-view";
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "10px";
    root.style.height = "100%";
    root.style.padding = "12px";
    root.style.boxSizing = "border-box";

    const header = document.createElement("div");
    header.className = "pdf-api-translator-view-header";
    const title = document.createElement("div");
    title.className = "pdf-api-translator-side-title";
    title.textContent = "PDF Translator";
    const modeButton = document.createElement("button");
    modeButton.className = "pdf-api-translator-side-mode";
    modeButton.textContent = "Popup";
    modeButton.addEventListener("click", () => {
      this.plugin.switchToPopupMode(this.currentSource, this.currentTranslation);
    });
    header.appendChild(title);
    header.appendChild(modeButton);
    root.appendChild(header);

    const sourceSection = document.createElement("div");
    sourceSection.className = "pdf-api-translator-view-section";
    const sourceLabel = document.createElement("div");
    sourceLabel.className = "pdf-api-translator-label";
    sourceLabel.textContent = "Selected text";
    sourceSection.appendChild(sourceLabel);
    this.sourceEl = document.createElement("div");
    this.sourceEl.className = "pdf-api-translator-text pdf-api-translator-muted";
    this.sourceEl.textContent = this.currentSource || "Select text in a PDF to translate.";
    if (this.currentSource) {
      this.sourceEl.classList.remove("pdf-api-translator-muted");
    }
    this.sourceEl.style.minHeight = "44px";
    sourceSection.appendChild(this.sourceEl);
    root.appendChild(sourceSection);

    const translationSection = document.createElement("div");
    translationSection.className = "pdf-api-translator-translation";
    translationSection.style.flex = "1";
    translationSection.style.minHeight = "120px";
    const translationLabel = document.createElement("div");
    translationLabel.className = "pdf-api-translator-label";
    translationLabel.textContent = "Translation";
    translationSection.appendChild(translationLabel);
    this.translationEl = document.createElement("div");
    this.translationEl.className = "pdf-api-translator-text pdf-api-translator-muted";
    this.translationEl.textContent = this.currentPending ? "Translating..." : this.currentTranslation || "No translation yet.";
    if (this.currentTranslation) {
      this.translationEl.classList.remove("pdf-api-translator-muted");
    }
    this.translationEl.style.minHeight = "80px";
    translationSection.appendChild(this.translationEl);
    root.appendChild(translationSection);

    container.appendChild(root);
  }

  getContentContainer() {
    return this.containerEl.querySelector(".view-content") || this.contentEl || this.containerEl;
  }

  async onClose() {
    const root = this.containerEl.querySelector(".pdf-api-translator-view-root");
    if (root) root.remove();
  }

  setPending(text) {
    this.currentSource = text;
    this.currentTranslation = "";
    this.currentPending = true;
    if (!this.sourceEl || !this.translationEl) this.render();
    this.sourceEl.textContent = text;
    this.sourceEl.classList.remove("pdf-api-translator-muted");
    this.translationEl.textContent = "Translating...";
    this.translationEl.classList.remove("pdf-api-translator-error");
    this.translationEl.classList.add("pdf-api-translator-muted");
  }

  setResult(text, translation) {
    this.currentSource = text;
    this.currentTranslation = translation;
    this.currentPending = false;
    if (!this.sourceEl || !this.translationEl) this.render();
    this.sourceEl.textContent = text;
    this.sourceEl.classList.remove("pdf-api-translator-muted");
    this.translationEl.textContent = translation;
    this.translationEl.classList.remove("pdf-api-translator-muted");
    this.translationEl.classList.remove("pdf-api-translator-error");
  }

  setError(message) {
    this.currentTranslation = "";
    this.currentPending = false;
    if (!this.translationEl) this.render();
    this.translationEl.textContent = message;
    this.translationEl.classList.remove("pdf-api-translator-muted");
    this.translationEl.classList.add("pdf-api-translator-error");
  }
}

module.exports = class PdfApiTranslatorPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.migrateSettings();
    this.selectionText = "";
    this.selectionTimer = null;
    this.sidebarTimer = null;
    this.pinnedPopupTimer = null;
    this.lastSidebarText = "";
    this.sidebarAutoActive = false;
    this.isPopupTranslating = false;
    this.resultDismissHandler = null;
    this.resultDismissTimer = null;
    this.resultWheelHandler = null;
    this.resultDrag = null;
    this.isResultPinned = false;
    this.popoverMouseMoveHandler = null;
    this.popoverWheelHandler = null;
    this.popoverFadeTimer = null;
    this.dismissedPopoverText = "";
    this.lastPointerPoint = null;
    this.translationCache = new Map();
    this.pendingTranslations = new Map();

    this.addSettingTab(new TranslatorSettingTab(this.app, this));

    this.registerView(VIEW_TYPE, (leaf) => {
      this.view = new TranslatorView(leaf, this);
      return this.view;
    });

    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        leaf.detach();
      }
    });

    this.addRibbonIcon("languages", "Open PDF Translator", () => this.activateView());
    this.addCommand({
      id: "open-pdf-translator-sidebar",
      name: "Open PDF Translator sidebar",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "enable-sidebar-auto-mode",
      name: "Enable sidebar mode",
      callback: async () => {
        this.settings.displayMode = "sidebar";
        this.settings.sidebarAutoMode = true;
        this.settings.popupButtonMode = false;
        this.sidebarAutoActive = false;
        await this.saveSettings();
        await this.activateView();
        new Notice("PDF Translator sidebar mode enabled.");
      }
    });
    this.addCommand({
      id: "translate-current-selection",
      name: "Translate current selection",
      callback: () => this.translateCurrentSelection()
    });
    this.addCommand({
      id: "test-translation-api",
      name: "Test translation API",
      callback: () => this.testTranslationApi()
    });

    this.registerDomEvent(document, "mouseup", (event) => this.scheduleSelectionHandling(event));
    this.registerDomEvent(document, "keyup", (event) => this.scheduleSelectionHandling(event));
    this.registerDomEvent(document, "selectionchange", () => this.scheduleSidebarLiveSelectionHandling());
  }

  onunload() {
    this.removePopover();
    this.removeResultPopover();
    this.removeSidePanel();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  migrateSettings() {
    if (!this.settings.displayMode) {
      this.settings.displayMode = this.settings.sidebarAutoMode ? "sidebar" : "popup";
    }
    this.settings.direction = "enToZh";
    this.settings.sidebarAutoMode = this.settings.displayMode === "sidebar";
    this.settings.popupButtonMode = this.settings.displayMode === "popup";
  }

  isTranslatorElement(element) {
    return !!(element && element.closest(
      ".pdf-api-translator-popover, .pdf-api-translator-result-popover, .pdf-api-translator-view-root, .pdf-api-translator-side-panel"
    ));
  }

  scheduleSidebarLiveSelectionHandling() {
    const active = document.activeElement;
    if (this.isTranslatorElement(active)) return;
    const canLiveUpdate =
      (this.settings.displayMode === "sidebar" && this.sidebarAutoActive)
      || (this.settings.displayMode === "popup" && this.isResultPinned && this.resultPopoverEl);
    if (!canLiveUpdate) return;
    window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => this.handleSelection(), 0);
  }

  async activateView() {
    this.removeSidePanel();
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    const view = await this.waitForView();
    view.render();
    return view;
  }

  async waitForView() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (this.view) return this.view;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error("Translator sidebar is not ready yet.");
  }

  openSidePanel() {
    if (!this.sidePanelEl) {
      const panel = document.createElement("div");
      panel.className = "pdf-api-translator-side-panel";
      panel.style.display = "flex";
      panel.style.flexDirection = "column";
      panel.style.gap = "10px";

      const header = document.createElement("div");
      header.className = "pdf-api-translator-side-header";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "8px";

      const title = document.createElement("div");
      title.className = "pdf-api-translator-side-title";
      title.textContent = "PDF Translator";
      title.style.fontWeight = "600";
      header.appendChild(title);

      const closeButton = document.createElement("button");
      closeButton.className = "pdf-api-translator-side-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => this.removeSidePanel());
      header.appendChild(closeButton);
      panel.appendChild(header);

      const sourceSection = document.createElement("div");
      sourceSection.className = "pdf-api-translator-view-section";
      const sourceLabel = document.createElement("div");
      sourceLabel.className = "pdf-api-translator-label";
      sourceLabel.textContent = "Selected text";
      sourceSection.appendChild(sourceLabel);
      this.sideSourceEl = document.createElement("div");
      this.sideSourceEl.className = "pdf-api-translator-text pdf-api-translator-muted";
      this.sideSourceEl.textContent = "Select text in a PDF to translate.";
      this.sideSourceEl.style.minHeight = "44px";
      sourceSection.appendChild(this.sideSourceEl);
      panel.appendChild(sourceSection);

      const translationSection = document.createElement("div");
      translationSection.className = "pdf-api-translator-translation";
      translationSection.style.flex = "1";
      translationSection.style.minHeight = "120px";
      const translationLabel = document.createElement("div");
      translationLabel.className = "pdf-api-translator-label";
      translationLabel.textContent = "Translation";
      translationSection.appendChild(translationLabel);
      this.sideTranslationEl = document.createElement("div");
      this.sideTranslationEl.className = "pdf-api-translator-text pdf-api-translator-muted";
      this.sideTranslationEl.textContent = "No translation yet.";
      this.sideTranslationEl.style.minHeight = "80px";
      translationSection.appendChild(this.sideTranslationEl);
      panel.appendChild(translationSection);

      document.body.appendChild(panel);
      this.sidePanelEl = panel;
    }

    return {
      setPending: (text) => {
        this.sideSourceEl.setText(text);
        this.sideSourceEl.removeClass("pdf-api-translator-muted");
        this.sideTranslationEl.setText("Translating...");
        this.sideTranslationEl.removeClass("pdf-api-translator-error");
        this.sideTranslationEl.addClass("pdf-api-translator-muted");
      },
      setResult: (text, translation) => {
        this.sideSourceEl.setText(text);
        this.sideSourceEl.removeClass("pdf-api-translator-muted");
        this.sideTranslationEl.setText(translation);
        this.sideTranslationEl.removeClass("pdf-api-translator-muted");
        this.sideTranslationEl.removeClass("pdf-api-translator-error");
      },
      setError: (message) => {
        this.sideTranslationEl.setText(message);
        this.sideTranslationEl.removeClass("pdf-api-translator-muted");
        this.sideTranslationEl.addClass("pdf-api-translator-error");
      }
    };
  }

  removeSidePanel() {
    if (this.sidePanelEl) {
      this.sidePanelEl.remove();
      this.sidePanelEl = null;
      this.sideSourceEl = null;
      this.sideTranslationEl = null;
    }
  }

  scheduleSelectionHandling(event) {
    const target = event && event.target;
    const element = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
    if (this.isTranslatorElement(element)) {
      return;
    }
    if (event && typeof event.clientX === "number" && typeof event.clientY === "number") {
      this.lastPointerPoint = { x: event.clientX, y: event.clientY };
    }
    window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => this.handleSelection(), 20);
  }

  handleSelection() {
    const canLiveUpdateWhileTranslating =
      (this.settings.displayMode === "sidebar" && this.sidebarAutoActive)
      || (this.settings.displayMode === "popup" && this.isResultPinned && this.resultPopoverEl);
    if (this.isPopupTranslating && !canLiveUpdateWhileTranslating) return;

    const selection = document.getSelection();
    const text = this.cleanSelectedText(selection && selection.toString());
    const anchorElement = selection && selection.anchorNode
      ? selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode.parentElement
      : null;
    if (this.isTranslatorElement(anchorElement)) return;
    if (!text || !this.isReadableSelection(selection)) {
      this.selectionText = "";
      this.dismissedPopoverText = "";
      this.removePopover();
      return;
    }

    if (text !== this.selectionText) {
      this.dismissedPopoverText = "";
    }
    this.selectionText = text;

    if (this.settings.displayMode === "popup") {
      if (this.isResultPinned && this.resultPopoverEl) {
        this.schedulePinnedPopupTranslation(text);
        return;
      }
      this.showPopover(selection, text);
    }

    if (this.settings.displayMode === "sidebar") {
      if (this.sidebarAutoActive) {
        this.scheduleSidebarTranslation(text);
      } else {
        this.showPopover(selection, text);
      }
    }
  }

  cleanSelectedText(text) {
    if (!text) return "";
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length < 1) return "";
    return cleaned.slice(0, Math.max(200, Number(this.settings.maxCharacters) || 3000));
  }

  isPdfSelection(selection) {
    if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return false;
    const node = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    if (!node) return false;
    return !!node.closest(".pdf-viewer, .pdf-container, .pdf-embed, .pdf-page, .pdf-text-layer, .textLayer");
  }

  isReadableSelection(selection) {
    if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return false;
    const node = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
    if (!node) return false;
    if (this.isPdfSelection(selection)) return true;
    return !!node.closest(".workspace-leaf-content, .modal, .popover");
  }

  showPopover(selection, text) {
    const rect = this.getSelectionRect(selection);
    if (!rect) return;
    if (text && text === this.dismissedPopoverText) return;

    this.removePopover();
    const popover = document.body.createDiv("pdf-api-translator-popover");
    const button = popover.createEl("button", { text: "Translate" });

    popover.addEventListener("mousedown", (event) => event.preventDefault());
    popover.addEventListener("mouseup", (event) => event.stopPropagation());
    popover.addEventListener("click", (event) => event.stopPropagation());

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      if (this.settings.displayMode === "sidebar") {
        this.sidebarAutoActive = true;
        this.lastSidebarText = "";
        this.removePopover();
        await this.translateIntoSidebar(text);
      } else {
        await this.translateFromPopup(rect, text);
      }
    });

    const pointer = this.lastPointerPoint;
    const popoverWidth = 96;
    const popoverHeight = 42;
    const left = pointer
      ? pointer.x + 12
      : Math.min(rect.left, window.innerWidth - popoverWidth - 12);
    const top = pointer
      ? pointer.y + 12
      : rect.bottom + 8 < window.innerHeight - 90 ? rect.bottom + 8 : rect.top - 48;
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, left))}px`;
    popover.style.top = `${Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, top))}px`;
    this.popoverEl = popover;
    this.installPopoverAutoDismiss(rect);
  }

  installPopoverAutoDismiss(selectionRect) {
    this.uninstallPopoverAutoDismiss();
    this.popoverWheelHandler = () => this.dismissPopover();
    document.addEventListener("wheel", this.popoverWheelHandler, true);

    this.popoverMouseMoveHandler = (event) => {
      if (!this.popoverEl) return;
      const popoverRect = this.popoverEl.getBoundingClientRect();
      const distance = this.distanceToRects(event.clientX, event.clientY, [popoverRect]);
      if (distance > 108) {
        this.popoverEl.classList.add("pdf-api-translator-popover-fading");
        window.clearTimeout(this.popoverFadeTimer);
        this.popoverFadeTimer = window.setTimeout(() => {
          if (this.popoverEl && this.popoverEl.classList.contains("pdf-api-translator-popover-fading")) {
            this.dismissPopover();
          }
        }, 420);
      } else {
        this.popoverEl.classList.remove("pdf-api-translator-popover-fading");
        window.clearTimeout(this.popoverFadeTimer);
        this.popoverFadeTimer = null;
      }
    };
    document.addEventListener("mousemove", this.popoverMouseMoveHandler, true);
  }

  uninstallPopoverAutoDismiss() {
    if (this.popoverWheelHandler) {
      document.removeEventListener("wheel", this.popoverWheelHandler, true);
      this.popoverWheelHandler = null;
    }
    if (this.popoverMouseMoveHandler) {
      document.removeEventListener("mousemove", this.popoverMouseMoveHandler, true);
      this.popoverMouseMoveHandler = null;
    }
    if (this.popoverFadeTimer) {
      window.clearTimeout(this.popoverFadeTimer);
      this.popoverFadeTimer = null;
    }
  }

  distanceToRects(x, y, rects) {
    let min = Number.POSITIVE_INFINITY;
    for (const rect of rects) {
      if (!rect) continue;
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      min = Math.min(min, Math.hypot(dx, dy));
    }
    return min;
  }

  async translateFromPopup(rect, text) {
    this.isPopupTranslating = true;
    try {
      this.removePopover();
      const result = this.showResultPopover(rect, "Translating...", text);
      const translation = await this.translate(text);
      result.textContent = translation;
      this.setResultTranslationText(translation);
      result.classList.remove("pdf-api-translator-error");
    } catch (error) {
      const message = this.formatError(error);
      const result = this.ensureResultPopover(rect);
      result.textContent = message;
      result.classList.add("pdf-api-translator-error");
      new Notice(message, 8000);
    } finally {
      this.isPopupTranslating = false;
    }
  }

  schedulePinnedPopupTranslation(text) {
    window.clearTimeout(this.pinnedPopupTimer);
    this.showPinnedPendingNow(text);
    this.pinnedPopupTimer = window.setTimeout(() => {
      this.translateIntoPinnedPopover(text);
    }, 180);
  }

  showPinnedPendingNow(text) {
    if (!text || !this.resultPopoverEl) return;
    const result = this.resultPopoverEl.querySelector(".pdf-api-translator-result");
    if (!result) return;
    this.setPinnedOriginalText(text);
    this.setResultTranslationText("");
    result.textContent = "Translating...";
    result.classList.remove("pdf-api-translator-error");
    result.classList.add("pdf-api-translator-muted");
  }

  async translateIntoPinnedPopover(text) {
    this.isPopupTranslating = true;
    try {
      await this.translateIntoSurface("popup", text, true);
    } finally {
      this.isPopupTranslating = false;
    }
  }

  showResultPopover(rect, text, originalText = "") {
    this.removeResultPopover();
    const popover = document.createElement("div");
    popover.className = "pdf-api-translator-result-popover";
    popover.dataset.originalText = originalText;
    popover.dataset.translationText = text === "Translating..." ? "" : text;

    const header = document.createElement("div");
    header.className = "pdf-api-translator-result-header";
    const title = document.createElement("div");
    title.className = "pdf-api-translator-result-title";
    title.textContent = "Translation";
    const hint = document.createElement("div");
    hint.className = "pdf-api-translator-result-hint";
    hint.textContent = "Click elsewhere to close";
    const closeButton = document.createElement("button");
    closeButton.className = "pdf-api-translator-result-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close translation");
    closeButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.removeResultPopover();
    });
    const originalButton = document.createElement("button");
    originalButton.className = "pdf-api-translator-original-toggle";
    originalButton.textContent = "Show original";
    originalButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    originalButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.togglePinnedOriginal();
    });
    const modeButton = document.createElement("button");
    modeButton.className = "pdf-api-translator-mode-toggle";
    modeButton.textContent = "Sidebar";
    modeButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    modeButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentOriginal = this.resultPopoverEl ? this.resultPopoverEl.dataset.originalText : originalText;
      const currentResult = this.resultPopoverEl && this.resultPopoverEl.querySelector(".pdf-api-translator-result");
      const fallbackTranslation = currentResult && currentResult.textContent !== "Translating..." ? currentResult.textContent : "";
      const currentTranslation = this.resultPopoverEl ? (this.resultPopoverEl.dataset.translationText || fallbackTranslation) : "";
      await this.switchToSidebarMode(currentOriginal || originalText, currentTranslation);
    });
    header.appendChild(title);
    header.appendChild(hint);
    header.appendChild(originalButton);
    header.appendChild(modeButton);
    header.appendChild(closeButton);
    popover.appendChild(header);

    const original = document.createElement("div");
    original.className = "pdf-api-translator-original";
    original.textContent = originalText;
    popover.appendChild(original);

    const result = document.createElement("div");
    result.className = "pdf-api-translator-result";
    result.textContent = text;
    popover.appendChild(result);

    popover.addEventListener("mousedown", (event) => this.startResultDrag(event));
    popover.addEventListener("mouseup", (event) => event.stopPropagation());
    popover.addEventListener("click", (event) => event.stopPropagation());

    const left = Math.min(rect.left, window.innerWidth - 452);
    const top = rect.bottom + 8 < window.innerHeight - 160 ? rect.bottom + 8 : rect.top - 180;
    popover.style.left = `${Math.max(12, left)}px`;
    popover.style.top = `${Math.max(12, top)}px`;
    document.body.appendChild(popover);
    this.resultPopoverEl = popover;
    this.installResultDismissHandler();
    return result;
  }

  startResultDrag(event) {
    if (!this.resultPopoverEl) return;
    const target = event.target;
    const element = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
    if (element && element.closest("button, select, textarea, input, .pdf-api-translator-result, .pdf-api-translator-original")) return;
    event.preventDefault();
    event.stopPropagation();
    this.pinResultPopover();
    const rect = this.resultPopoverEl.getBoundingClientRect();
    this.resultDrag = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    document.addEventListener("mousemove", this.boundResultDragMove = (moveEvent) => this.moveResultPopover(moveEvent), true);
    document.addEventListener("mouseup", this.boundResultDragEnd = () => this.endResultDrag(), true);
  }

  moveResultPopover(event) {
    if (!this.resultDrag || !this.resultPopoverEl) return;
    const nextLeft = this.resultDrag.left + event.clientX - this.resultDrag.startX;
    const nextTop = this.resultDrag.top + event.clientY - this.resultDrag.startY;
    const maxLeft = window.innerWidth - this.resultPopoverEl.offsetWidth - 8;
    const maxTop = window.innerHeight - this.resultPopoverEl.offsetHeight - 8;
    this.resultPopoverEl.style.left = `${Math.max(8, Math.min(maxLeft, nextLeft))}px`;
    this.resultPopoverEl.style.top = `${Math.max(8, Math.min(maxTop, nextTop))}px`;
  }

  endResultDrag() {
    document.removeEventListener("mousemove", this.boundResultDragMove, true);
    document.removeEventListener("mouseup", this.boundResultDragEnd, true);
    this.boundResultDragMove = null;
    this.boundResultDragEnd = null;
    this.resultDrag = null;
  }

  pinResultPopover() {
    this.isResultPinned = true;
    this.uninstallResultDismissHandler();
    this.uninstallResultWheelHandler();
    if (this.resultPopoverEl) {
      this.resultPopoverEl.classList.add("pdf-api-translator-result-pinned");
      this.resultPopoverEl.classList.add("pdf-api-translator-show-original");
      const button = this.resultPopoverEl.querySelector(".pdf-api-translator-original-toggle");
      if (button) button.textContent = "Hide original";
    }
  }

  togglePinnedOriginal() {
    if (!this.resultPopoverEl || !this.isResultPinned) return;
    const isShown = this.resultPopoverEl.classList.toggle("pdf-api-translator-show-original");
    const button = this.resultPopoverEl.querySelector(".pdf-api-translator-original-toggle");
    if (button) button.textContent = isShown ? "Hide original" : "Show original";
  }

  setPinnedOriginalText(text) {
    if (!this.resultPopoverEl) return;
    this.resultPopoverEl.dataset.originalText = text;
    const original = this.resultPopoverEl.querySelector(".pdf-api-translator-original");
    if (original) original.textContent = text;
  }

  setResultTranslationText(text) {
    if (this.resultPopoverEl) {
      this.resultPopoverEl.dataset.translationText = text;
    }
  }

  isPinnedPopoverShowingText(text) {
    return !!(
      this.resultPopoverEl
      && this.resultPopoverEl.dataset.originalText === text
    );
  }

  async switchToSidebarMode(text = "", translation = "") {
    this.settings.displayMode = "sidebar";
    this.settings.sidebarAutoMode = true;
    this.settings.popupButtonMode = false;
    this.sidebarAutoActive = true;
    this.lastSidebarText = "";
    this.removePopover();
    this.removeResultPopover();
    await this.saveSettings();
    const selectedText = this.cleanSelectedText(text || (document.getSelection() && document.getSelection().toString()));
    if (selectedText) {
      const view = await this.activateView();
      if (translation && translation !== "Translating...") {
        this.lastSidebarText = selectedText;
        view.setResult(selectedText, translation);
      } else {
        await this.translateIntoSidebar(selectedText);
      }
    } else {
      await this.activateView();
    }
    new Notice("Switched to sidebar mode.");
  }

  async switchToPopupMode(text = "", translation = "") {
    const selectedText = this.cleanSelectedText(text || (document.getSelection() && document.getSelection().toString()));
    const selectedTranslation = translation && translation !== "Translating..." ? translation : "";
    this.settings.displayMode = "popup";
    this.settings.sidebarAutoMode = false;
    this.settings.popupButtonMode = true;
    this.sidebarAutoActive = false;
    this.lastSidebarText = "";
    this.dismissedPopoverText = selectedText || this.selectionText || "";
    this.removePopover();
    this.removeResultPopover();
    await this.saveSettings();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.removeSidePanel();
    if (selectedText && selectedTranslation) {
      const selectionRect = this.getSelectionRect(document.getSelection());
      const fallbackRect = { left: Math.max(16, window.innerWidth - 452), top: 80, bottom: 96 };
      this.showPinnedResultPopover(selectionRect || fallbackRect, selectedTranslation, selectedText);
    } else if (selectedText) {
      const selectionRect = this.getSelectionRect(document.getSelection());
      await this.translateIntoNewPinnedPopover(selectionRect || { left: 16, top: 80, bottom: 96 }, selectedText);
    }
    new Notice("Switched to popup mode.");
  }

  showPinnedResultPopover(rect, translation, originalText) {
    const result = this.showResultPopover(rect, translation, originalText);
    this.setResultTranslationText(translation);
    this.pinResultPopover();
    return result;
  }

  async translateIntoNewPinnedPopover(rect, text) {
    this.isPopupTranslating = true;
    try {
      this.showResultPopover(rect, "Translating...", text);
      this.pinResultPopover();
      await this.translateIntoSurface("popup", text, true);
    } finally {
      this.isPopupTranslating = false;
    }
  }

  ensureResultPopover(rect) {
    if (this.resultPopoverEl) {
      const existing = this.resultPopoverEl.querySelector(".pdf-api-translator-result");
      if (existing) return existing;
    }
    return this.showResultPopover(rect || { left: 16, top: 16, bottom: 48 }, "");
  }

  installResultDismissHandler() {
    this.uninstallResultDismissHandler();
    this.resultDismissTimer = window.setTimeout(() => {
      this.resultDismissTimer = null;
      if (!this.resultPopoverEl) return;
      this.resultDismissHandler = (event) => {
        if (this.isResultPinned) return;
        const target = event && event.target;
        const element = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
        if (element && element.closest(".pdf-api-translator-result-popover")) {
          return;
        }
        this.removeResultPopover();
      };
      document.addEventListener("mousedown", this.resultDismissHandler, true);
      this.resultWheelHandler = () => {
        if (!this.isResultPinned) this.removeResultPopover();
      };
      document.addEventListener("wheel", this.resultWheelHandler, true);
    }, 300);
  }

  uninstallResultDismissHandler() {
    if (this.resultDismissTimer) {
      window.clearTimeout(this.resultDismissTimer);
      this.resultDismissTimer = null;
    }
    if (this.resultDismissHandler) {
      document.removeEventListener("mousedown", this.resultDismissHandler, true);
      this.resultDismissHandler = null;
    }
  }

  uninstallResultWheelHandler() {
    if (this.resultWheelHandler) {
      document.removeEventListener("wheel", this.resultWheelHandler, true);
      this.resultWheelHandler = null;
    }
  }

  getSelectionRect(selection) {
    try {
      if (!selection || selection.rangeCount === 0) return null;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect && rect.width >= 0 && rect.height >= 0) return rect;
    } catch (error) {
      return null;
    }
    return null;
  }

  removePopover() {
    this.uninstallPopoverAutoDismiss();
    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
  }

  dismissPopover() {
    if (this.selectionText) {
      this.dismissedPopoverText = this.selectionText;
    }
    this.removePopover();
  }

  removeResultPopover() {
    this.uninstallResultDismissHandler();
    this.uninstallResultWheelHandler();
    if (this.boundResultDragMove || this.boundResultDragEnd) {
      this.endResultDrag();
    }
    this.isResultPinned = false;
    window.clearTimeout(this.pinnedPopupTimer);
    if (this.resultPopoverEl) {
      this.resultPopoverEl.remove();
      this.resultPopoverEl = null;
    }
  }

  scheduleSidebarTranslation(text) {
    window.clearTimeout(this.sidebarTimer);
    this.showSidebarPendingNow(text);
    this.sidebarTimer = window.setTimeout(() => this.translateIntoSidebar(text, true), 120);
  }

  showSidebarPendingNow(text) {
    if (!text) return;
    if (
      text === this.lastSidebarText
      && this.view
      && this.view.currentTranslation
      && !this.view.currentPending
    ) {
      return;
    }
    if (this.view && this.view.sourceEl && this.view.translationEl) {
      this.view.setPending(text);
      return;
    }
    this.activateView()
      .then((view) => {
        if (this.settings.displayMode === "sidebar" && this.selectionText === text) {
          view.setPending(text);
        }
      })
      .catch(() => {});
  }

  async translateIntoSidebar(text, pendingAlreadyShown = false) {
    return this.translateIntoSurface("sidebar", text, pendingAlreadyShown);
  }

  async translateIntoSurface(surface, text, pendingAlreadyShown = false) {
    if (!text) return;
    if (surface === "sidebar" && text === this.lastSidebarText && this.view && this.view.translationEl) return;
    if (surface === "sidebar") this.lastSidebarText = text;

    const target = await this.prepareTranslationSurface(surface, text, pendingAlreadyShown);
    if (!target) return;

    try {
      const translation = await this.translate(text);
      if (!this.isSurfaceShowingText(surface, text, target)) return;
      this.setSurfaceTranslation(surface, text, translation, target);
    } catch (error) {
      if (!this.isSurfaceShowingText(surface, text, target)) return;
      const message = this.formatError(error);
      this.setSurfaceError(surface, message, target);
      new Notice(message, 8000);
    }
  }

  async prepareTranslationSurface(surface, text, pendingAlreadyShown = false) {
    if (surface === "sidebar") {
      const view = await this.activateView();
      if (!pendingAlreadyShown) {
        view.setPending(text);
      }
      return { view };
    }

    if (!this.resultPopoverEl) return null;
    const result = this.resultPopoverEl.querySelector(".pdf-api-translator-result");
    if (!result) return null;
    if (!pendingAlreadyShown) {
      this.showPinnedPendingNow(text);
    }
    result.classList.remove("pdf-api-translator-error");
    return { result };
  }

  isSurfaceShowingText(surface, text, target) {
    if (surface === "sidebar") {
      return !this.sidebarAutoActive || this.settings.displayMode !== "sidebar" || this.isSidebarShowingText(text, target.view);
    }
    return this.settings.displayMode !== "popup" || !this.isResultPinned || this.isPinnedPopoverShowingText(text);
  }

  setSurfaceTranslation(surface, text, translation, target) {
    if (surface === "sidebar") {
      target.view.setResult(text, translation);
      return;
    }
    target.result.textContent = translation;
    this.setResultTranslationText(translation);
    target.result.classList.remove("pdf-api-translator-error");
    target.result.classList.remove("pdf-api-translator-muted");
  }

  setSurfaceError(surface, message, target) {
    if (surface === "sidebar") {
      target.view.setError(message);
      return;
    }
    target.result.textContent = message;
    target.result.classList.add("pdf-api-translator-error");
    target.result.classList.remove("pdf-api-translator-muted");
  }

  isSidebarShowingText(text, view = this.view) {
    return !!(view && view.currentSource === text);
  }

  async translateCurrentSelection() {
    const selection = document.getSelection();
    const text = this.cleanSelectedText(selection && selection.toString());
    if (!text) {
      new Notice("No selected text to translate.");
      return;
    }
    await this.translateIntoSidebar(text);
  }

  async testTranslationApi() {
    await this.activateView();
    const text = "Heat flux is proportional to the temperature gradient.";
    this.lastSidebarText = "";
    await this.translateIntoSidebar(text);
  }

  async translate(text) {
    const provider = this.settings.provider;
    const apiKey = provider === "deepseek" ? this.settings.deepseekApiKey : this.settings.openaiApiKey;
    const model = provider === "deepseek" ? this.settings.deepseekModel : this.settings.openaiModel;
    const url = provider === "deepseek"
      ? "https://api.deepseek.com/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      throw new Error(`Missing ${provider === "deepseek" ? "DeepSeek" : "OpenAI"} API key.`);
    }
    if (!model) {
      throw new Error("Missing model name.");
    }

    const cacheKey = this.getTranslationCacheKey(text, provider, model);
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }
    if (this.pendingTranslations.has(cacheKey)) {
      return this.pendingTranslations.get(cacheKey);
    }

    const request = this.requestTranslation({ url, apiKey, model, text });
    this.pendingTranslations.set(cacheKey, request);
    try {
      const translation = await request;
      this.rememberTranslation(cacheKey, translation);
      return translation;
    } finally {
      this.pendingTranslations.delete(cacheKey);
    }
  }

  async requestTranslation({ url, apiKey, model, text }) {
    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: this.buildSystemPrompt(text) },
          { role: "user", content: text }
        ]
      }),
      throw: false
    });

    if (response.status < 200 || response.status >= 300) {
      const message = this.extractApiError(response);
      throw new Error(`Translation API error: ${message}`);
    }

    const data = response.json || JSON.parse(response.text);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      throw new Error("Translation API returned no text.");
    }
    return content.trim();
  }

  getTranslationCacheKey(text, provider, model) {
    return [
      provider,
      model,
      this.settings.domainHint || "",
      this.settings.glossary || "",
      text
    ].join("\u001f");
  }

  rememberTranslation(cacheKey, translation) {
    if (this.translationCache.size >= 80) {
      const firstKey = this.translationCache.keys().next().value;
      this.translationCache.delete(firstKey);
    }
    this.translationCache.set(cacheKey, translation);
  }

  extractApiError(response) {
    try {
      const data = response.json || JSON.parse(response.text || "{}");
      if (data && data.error) {
        return data.error.message || JSON.stringify(data.error);
      }
    } catch (error) {
      // Fall back to the raw response text below.
    }
    return response.text || `HTTP ${response.status}`;
  }

  formatError(error) {
    const message = error && error.message ? error.message : String(error);
    return message.length > 900 ? `${message.slice(0, 900)}...` : message;
  }

  buildSystemPrompt(text) {
    const direction = "Translate American English into Simplified Chinese.";

    const relevantGlossary = this.getRelevantGlossary(text);
    const glossaryBlock = relevantGlossary.length
      ? `\nUse these glossary entries when applicable:\n${relevantGlossary.join("\n")}`
      : "";

    return [
      direction,
      this.settings.domainHint ? `Domain: ${this.settings.domainHint}` : "",
      "Preserve equations, symbols, variable names, units, and citations.",
      "Only return the translation.",
      glossaryBlock
    ].filter(Boolean).join("\n");
  }

  getRelevantGlossary(text) {
    const source = text.toLocaleLowerCase();
    return this.parseGlossary()
      .filter((entry) => source.includes(entry.source.toLocaleLowerCase()) || text.includes(entry.target))
      .map((entry) => `${entry.source} = ${entry.target}`)
      .slice(0, 30);
  }

  parseGlossary() {
    return (this.settings.glossary || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s*=\s*|\s*->\s*/);
        if (parts.length < 2) return null;
        return { source: parts[0].trim(), target: parts.slice(1).join(" = ").trim() };
      })
      .filter((entry) => entry && entry.source && entry.target);
  }
};

class TranslatorSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "PDF API Translator" });

    new Setting(containerEl)
      .setName("Translation provider")
      .addDropdown((dropdown) => dropdown
        .addOption("openai", "GPT")
        .addOption("deepseek", "DeepSeek")
        .setValue(this.plugin.settings.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value;
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.provider === "deepseek") {
      new Setting(containerEl)
        .setName("DeepSeek API key")
        .addText((text) => text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async (value) => {
            this.plugin.settings.deepseekApiKey = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName("DeepSeek model")
        .addText((text) => text
          .setPlaceholder("deepseek-chat")
          .setValue(this.plugin.settings.deepseekModel)
          .onChange(async (value) => {
            this.plugin.settings.deepseekModel = value.trim();
            await this.plugin.saveSettings();
          }));
    } else {
      new Setting(containerEl)
        .setName("GPT API key")
        .addText((text) => text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName("GPT model")
        .addText((text) => text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.openaiModel)
          .onChange(async (value) => {
            this.plugin.settings.openaiModel = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName("Display mode")
      .setDesc("Choose one mode: show the result in a popup, or send it to the right sidebar after clicking Translate.")
      .addDropdown((dropdown) => dropdown
        .addOption("popup", "Popup button")
        .addOption("sidebar", "Sidebar auto")
        .setValue(this.plugin.settings.displayMode)
        .onChange(async (value) => {
          this.plugin.settings.displayMode = value;
          this.plugin.settings.popupButtonMode = value === "popup";
          this.plugin.settings.sidebarAutoMode = value === "sidebar";
          this.plugin.lastSidebarText = "";
          this.plugin.sidebarAutoActive = false;
          this.plugin.isPopupTranslating = false;
          this.plugin.removePopover();
          this.plugin.removeResultPopover();
          await this.plugin.saveSettings();
          if (value === "sidebar") {
            await this.plugin.activateView();
          } else {
            this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE);
            this.plugin.removeSidePanel();
          }
        }));

    new Setting(containerEl)
      .setName("Maximum selected characters")
      .addText((text) => text
        .setValue(String(this.plugin.settings.maxCharacters))
        .onChange(async (value) => {
          this.plugin.settings.maxCharacters = Math.max(200, Number(value) || 3000);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Domain hint")
      .setDesc("This is sent with each request so the model keeps the translation in the right subject area.")
      .addTextArea((text) => text
        .setValue(this.plugin.settings.domainHint)
        .onChange(async (value) => {
          this.plugin.settings.domainHint = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Glossary")
      .setDesc("One entry per line, for example: source term = preferred translation. Only matched entries are sent to the API.")
      .setClass("pdf-api-translator-setting")
      .addTextArea((text) => text
        .setValue(this.plugin.settings.glossary)
        .onChange(async (value) => {
          this.plugin.settings.glossary = value;
          await this.plugin.saveSettings();
        }));
  }
}
