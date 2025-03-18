class BackgroundManager {
    constructor() {
      this.serverUrl = 'http://localhost:5000';
      this.lastUrl = '';
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
  
    
      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
          const tab = await chrome.tabs.get(activeInfo.tabId);
          this.handleTabChange(tab);
        } catch (error) {
          console.error('Tab change error:', error);
        }
      });
  

      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url) {
          this.handleTabChange(tab);
        }
      });
  
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SHOW_NOTIFICATION') {
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
          
          //waiits for 2 sec
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 2000);
        }
        return true;
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
  
    async handleTabChange(tab) {
      if (!tab.url || tab.url === this.lastUrl) return;
      
      this.lastUrl = tab.url;
      console.log('Tab/URL changed to:', tab.url);
  
  const supportedDomains = [
    'chat.openai.com',
    'chatgpt.com',
    'claude.anthropic.com',
    'gemini.google.com',
    'x.ai',
    'chat.deepseek.com',
    'kimi.moonshot.cn',
    'dashscope.aliyun.com'
  ];
  
      const isLLMPage = supportedDomains.some(domain => tab.url.includes(domain));
      
      if (isLLMPage) {
     
        chrome.tabs.sendMessage(tab.id, {
          type: 'TAB_CHANGED',
          data: { url: tab.url }
        });
      }
    }
}
