class PopupManager {
  constructor() {
    console.log('PopupManager constructor called');
    this.currentLLM = '';
    this.currentContext = '';
    this.autoSwitchEnabled = true;
    this.summaryEnabled = true;
    this.minLength = 1000;
    this.lastCopiedTime = null;
    this.init();
  }

  async init() {
    console.log('PopupManager initializing...');
    await this.loadSettings();
    this.setupEventListeners();
    await this.getCurrentState();
    this.autoCopyContext();
  }

  async loadSettings() {
    const settings = await chrome.storage.local.get([
      'summaryEnabled',
      'minLength'
    ]);
    this.summaryEnabled = settings.summaryEnabled ?? true;
    this.minLength = settings.minLength ?? 1000;
  }

  async getCurrentState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Current summarization settings:', {
        enabled: this.summaryEnabled,
        minLength: this.minLength
      });
      
      chrome.tabs.sendMessage(tab.id, { 
        type: 'GET_CURRENT_STATE',
        settings: {
          summaryEnabled: this.summaryEnabled,
          minLength: this.minLength
        }
      }, response => {
        console.log('Got response from content script:', response);
        if (response) {
          this.handleContextUpdate(response);
        }
        this.updateUI();
      });
    } catch (error) {
      console.error('Error getting state:', error);
    }
  }

  async autoCopyContext() {
    if (this.currentContext && this.autoSwitchEnabled) {
      try {
        await navigator.clipboard.writeText(this.currentContext);
        this.lastCopiedTime = new Date();
        this.showCopyStatus('Context automatically copied to clipboard');
        this.updateUI();
      } catch (error) {
        console.error('Auto copy failed:', error);
        this.showCopyStatus('Failed to copy automatically');
      }
    }
  }

  setupEventListeners() {
    console.log('Setting up event listeners');
    
   
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_NOTIFICATION') {
        this.showCopyStatus(message.message);
      } else if (message.type === 'CONTEXT_UPDATE') {
        this.handleContextUpdate(message.data);
      }
    });

   
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          if (!this.currentContext) {
            console.log('No context to copy');
            return;
          }
          await navigator.clipboard.writeText(this.currentContext);
          this.lastCopiedTime = new Date();
          copyBtn.textContent = 'Copied!';
          this.showCopyStatus('Context manually copied to clipboard');
          this.updateUI();
          setTimeout(() => {
            copyBtn.textContent = 'Copy Context';
          }, 2000);
        } catch (error) {
          console.error('Copy failed:', error);
          copyBtn.textContent = 'Copy Failed';
          this.showCopyStatus('Failed to copy');
          setTimeout(() => {
            copyBtn.textContent = 'Copy Context';
          }, 2000);
        }
      });
    }

 
    const autoSwitchToggle = document.getElementById('autoSwitchToggle');
    if (autoSwitchToggle) {
      autoSwitchToggle.checked = this.autoSwitchEnabled;
      autoSwitchToggle.addEventListener('change', () => {
        this.autoSwitchEnabled = autoSwitchToggle.checked;
        if (this.autoSwitchEnabled) {
          this.autoCopyContext();
        }
        this.updateUI();
      });
    }

   
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'INJECT_CONTEXT',
            context: this.currentContext
          });
        });
      });
    }

    
    const summaryToggle = document.getElementById('summaryToggle');
    if (summaryToggle) {
      summaryToggle.checked = this.summaryEnabled;
      summaryToggle.addEventListener('change', () => {
        this.summaryEnabled = summaryToggle.checked;
        chrome.storage.local.set({ summaryEnabled: this.summaryEnabled });
        this.updateSummaryStatus();
        this.getCurrentState(); 
      });
    }

    
    const minLengthInput = document.getElementById('minLength');
    if (minLengthInput) {
      minLengthInput.value = this.minLength;
      minLengthInput.addEventListener('change', () => {
        this.minLength = parseInt(minLengthInput.value);
        chrome.storage.local.set({ minLength: this.minLength });
        this.getCurrentState(); 
      });
    }
  }

  handleContextUpdate(data) {
    console.log('Handling context update:', data);
    if (data && data.llmType) {
      this.currentLLM = data.llmType;
      this.currentContext = data.content || '';
   
      this.autoCopyContext();
      this.updateUI();
    }
  }

  showCopyStatus(message) {
    const statusElement = document.getElementById('copyStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.classList.remove('status-active');
    
      void statusElement.offsetWidth;
      statusElement.classList.add('status-active');
    }
  }

  updateSummaryStatus() {
    const statusElement = document.getElementById('summaryStatus');
    if (statusElement) {
      if (this.summaryEnabled) {
        statusElement.textContent = 'Summarization active';
        statusElement.classList.add('summary-active');
      } else {
        statusElement.textContent = 'Summarization disabled';
        statusElement.classList.remove('summary-active');
      }
    }
  }

  updateUI() {
    console.log('Updating UI with LLM:', this.currentLLM);
    const llmName = document.getElementById('llm-name');
    llmName.textContent = this.currentLLM ? 
      (this.currentLLM.charAt(0).toUpperCase() + this.currentLLM.slice(1)) : 
      'Unknown';

    const contextElement = document.getElementById('context');
    if (this.currentContext) {
      contextElement.innerHTML = `<pre>${this.currentContext}</pre>`;
    } else {
      contextElement.innerHTML = '<div class="no-context">No context available</div>';
    }

    
    const statusElement = document.getElementById('switchStatus');
    if (statusElement) {
      statusElement.textContent = this.autoSwitchEnabled ? 
        'Auto-switching enabled (context will be auto-copied)' : 
        'Auto-switching disabled';
      statusElement.className = this.autoSwitchEnabled ? 'status-enabled' : 'status-disabled';
    }

    
    const timeElement = document.getElementById('lastCopiedTime');
    if (timeElement && this.lastCopiedTime) {
      timeElement.textContent = `Last copied: ${this.lastCopiedTime.toLocaleTimeString()}`;
    }

    this.updateSummaryStatus();
  }
}


document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - creating PopupManager');
  window.popupManager = new PopupManager();
});
