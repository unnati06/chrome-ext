class BackgroundManager {
    constructor() {
      this.serverUrl = 'http://localhost:5000';
      this.init();
    }
  
    async init() {
      this.loadConfiguration();
      this.setupListeners();
    }
  
    loadConfiguration() {
      chrome.storage.sync.get(['serverUrl'], (result) => {
        if (result.serverUrl) this.serverUrl = result.serverUrl;
      });
    }
  
    setupListeners() {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'CONTEXT_UPDATE') {
          this.handleContextUpdate(msg.data);
          // Forward the message to popup
          chrome.runtime.sendMessage(msg);
        }
        return true;
      });
  
      chrome.runtime.onInstalled.addListener(() => {
        chrome.storage.sync.set({ 
          serverUrl: this.serverUrl,
          configVersion: 1.0
        });
      });
    }
  
    async handleContextUpdate(data) {
      try {
        await this.sendToServer(data);
      } catch (error) {
        console.error('Context update failed:', error);
      }
    }
  
    async sendToServer(payload) {
      const response = await fetch(`${this.serverUrl}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Chat Context',
          metadata: {
            source: payload.source
          },
          content: payload.content
        })
      });
  
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
    }
}
  
// Initialize singleton
// if (!window.backgroundManager) {
//   window.backgroundManager = new BackgroundManager();
// }