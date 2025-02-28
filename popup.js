class PopupManager {
  constructor() {
    console.log('PopupManager constructor called');
    this.currentLLM = '';
    this.currentContext = '';
    this.autoSwitchEnabled = true; // Default enabled
    this.lastCopiedTime = null;
    this.init();
  }

  async init() {
    console.log('PopupManager initializing...');
    this.setupEventListeners();
    await this.getCurrentState();
    // Automatically copy context when popup opens
    this.autoCopyContext();
  }

  async getCurrentState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Current tab:', tab);

      // Check if we're on a supported LLM page
      const supportedDomains = [
        'chat.openai.com',
        'claude.ai',
        'bard.google.com',
        'x.ai',
        'deepseek.com',
        'kimi.ai',
        'aliyun.com',
        'chatgpt.com'
      ];

      const isSupported = supportedDomains.some(domain => tab.url.includes(domain));
      
      if (!isSupported) {
        console.log('Not on a supported LLM page');
        this.currentLLM = 'Not on LLM page';
        this.updateUI();
        return;
      }

      // Check if content script is ready by sending a ping
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tab.id, { type: 'PING' }, response => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else if (response && response.pong) {
              resolve();
            }
          });
        });

        // Now that we know the content script is ready, request the state
        chrome.tabs.sendMessage(tab.id, { 
          type: 'GET_CURRENT_STATE',
          from: 'popup'
        }, response => {
          if (chrome.runtime.lastError) {
            console.log('State request error:', chrome.runtime.lastError);
            this.currentLLM = 'Error getting LLM state';
          } else if (response) {
            console.log('Received state:', response);
            this.handleContextUpdate(response);
          }
          this.updateUI();
        });

      } catch (error) {
        console.log('Content script not ready:', error);
        this.currentLLM = 'Waiting for page load...';
        this.updateUI();
      }

    } catch (error) {
      console.error('Error in getCurrentState:', error);
      this.currentLLM = 'Error detecting LLM';
      this.updateUI();
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
    
    // Listen for context updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_NOTIFICATION') {
        this.showCopyStatus(message.message);
      } else if (message.type === 'CONTEXT_UPDATE') {
        this.handleContextUpdate(message.data);
      }
    });

    // Manual copy button handler
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

    // Auto-switch toggle
    const autoSwitchToggle = document.getElementById('autoSwitchToggle');
    if (autoSwitchToggle) {
      autoSwitchToggle.checked = this.autoSwitchEnabled;
      autoSwitchToggle.addEventListener('change', () => {
        this.autoSwitchEnabled = autoSwitchToggle.checked;
        if (this.autoSwitchEnabled) {
          this.autoCopyContext(); // Auto copy when enabling
        }
        this.updateUI();
      });
    }

    // Paste button (for manual injection)
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
  }

  handleContextUpdate(data) {
    console.log('Handling context update:', data);
    if (data && data.llmType) {
      this.currentLLM = data.llmType;
      this.currentContext = data.content || '';
      // Auto copy when context updates
      this.autoCopyContext();
      this.updateUI();
    }
  }

  showCopyStatus(message) {
    const statusElement = document.getElementById('copyStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.classList.remove('status-active');
      // Trigger reflow
      void statusElement.offsetWidth;
      statusElement.classList.add('status-active');
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

    // Update auto-switch status
    const statusElement = document.getElementById('switchStatus');
    if (statusElement) {
      statusElement.textContent = this.autoSwitchEnabled ? 
        'Auto-switching enabled (context will be auto-copied)' : 
        'Auto-switching disabled';
      statusElement.className = this.autoSwitchEnabled ? 'status-enabled' : 'status-disabled';
    }

    // Show last copied time if available
    const timeElement = document.getElementById('lastCopiedTime');
    if (timeElement && this.lastCopiedTime) {
      timeElement.textContent = `Last copied: ${this.lastCopiedTime.toLocaleTimeString()}`;
    }
  }
}

// Create instance when document is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - creating PopupManager');
  window.popupManager = new PopupManager();
});
