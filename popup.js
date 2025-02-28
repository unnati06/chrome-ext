class PopupManager {
  constructor() {
    console.log('PopupManager constructor called');
    this.currentLLM = '';
    this.currentContext = '';
    this.init();
  }

  async init() {
    console.log('PopupManager initializing...');
    await this.getCurrentState();
    this.setupEventListeners();
    this.setupMessageListener();
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

  setupEventListeners() {
    console.log('Setting up event listeners');
    // Add copy button handler
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          if (!this.currentContext) {
            console.log('No context to copy');
            return;
          }
          
          await navigator.clipboard.writeText(this.currentContext);
          console.log('Context copied to clipboard');
          
          // Visual feedback
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Context';
          }, 2000);
        } catch (error) {
          console.error('Failed to copy:', error);
          copyBtn.textContent = 'Copy Failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Context';
          }, 2000);
        }
      });
    }

    // Add paste button handler if needed
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          this.currentContext = text;
          this.updateUI();
          console.log('Context pasted from clipboard');
        } catch (error) {
          console.error('Failed to paste:', error);
        }
      });
    }
  }

  setupMessageListener() {
    console.log('Setting up popup message listener');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Popup received message:', message);
      if (message.type === 'CONTEXT_UPDATE') {
        this.handleContextUpdate(message.data);
      }
    });
  }

  handleContextUpdate(data) {
    console.log('Handling context update:', data);
    if (data && data.llmType) {
      this.currentLLM = data.llmType;
      this.currentContext = data.content || '';
      this.updateUI();
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
  }
}

// Create instance when document is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - creating PopupManager');
  window.popupManager = new PopupManager();
});
