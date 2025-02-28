import Summarizer from './summarizer.js';

class LLMMonitor {
    constructor() {
        console.log('LLMMonitor constructor called');
        this.config = {
            inputSelectors: [],
            outputSelectors: []
        };
        this.initialized = false;
        this.lastContext = '';
        console.log('LLMMonitor: creating summarizer instance');
        this.summarizer = new Summarizer();
        this.observedElements = new WeakMap();
        this.debounceTimers = new WeakMap();
        this.setupAutoContextSwitching();
        this.init();
        this.summaryEnabled = true;
        this.minLength = 1000;
    }

    setupAutoContextSwitching() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'TAB_CHANGED') {
                this.handleTabChange();
            }
            return true;
        });
        this.observeDOM();
    }

    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            if (this.observerTimeout) {
                clearTimeout(this.observerTimeout);
            }
            
            this.observerTimeout = setTimeout(() => {
                this.checkForContextChanges();
            }, 1000);
        });

        const config = { 
            childList: true, 
            subtree: true, 
            characterData: true 
        };
        
        const chatContainer = document.body;
        observer.observe(chatContainer, config);
    }

    async checkForContextChanges() {
        const currentContext = this.getCurrentContext();
        if (currentContext !== this.lastContext) {
            console.log('Context changed, updating...');
            this.lastContext = currentContext;
            await this.injectContext(currentContext);
        }
    }

    async handleTabChange() {
        console.log('Handling tab change');
        try {
            await this.waitForChat();
            
        
            const context = this.getCurrentContext();
            if (context) {
                try {
                    await navigator.clipboard.writeText(context);
                    console.log('Context copied to clipboard automatically');
                    chrome.runtime.sendMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: 'Context copied to clipboard'
                    });
                } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                }
            }
        } catch (error) {
            console.error('Tab change handling error:', error);
        }
    }

    async waitForChat() {
       
        return new Promise((resolve) => {
            const checkDOM = () => {
                const llmType = this.detectLLM();
                const selector = this.config.outputSelectors.find(s => s.platform === llmType);
                
                if (selector && document.querySelector(selector.selector)) {
                    resolve();
                } else {
                    setTimeout(checkDOM, 500);
                }
            };
            checkDOM();
        });
    }

    async injectContext(context) {
        try {
            const llmType = this.detectLLM();
            const inputSelector = this.config.inputSelectors.find(s => s.platform === llmType);
            
            if (!inputSelector) {
                console.log('No input selector found for:', llmType);
                return;
            }

            const inputElement = document.querySelector(inputSelector.selector);
            if (!inputElement) {
                console.log('Input element not found');
                return;
            }

         
            if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
                inputElement.value = context;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                inputElement.textContent = context;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            }

            console.log('Context injected successfully');
        } catch (error) {
            console.error('Context injection error:', error);
        }
    }

    setupMessageHandlers() {
        console.log('Setting up content script message handlers');
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Content script received message:', message);
            
            if (message.type === 'PING') {
                console.log('Received ping, sending pong');
                sendResponse({ pong: true });
                return true;
            }
            
            if (message.type === 'GET_CURRENT_STATE') {
                console.log('Received state request');
                const state = {
                    llmType: this.detectLLM(),
                    content: this.getCurrentContext()
                };
                console.log('Sending state:', state);
                sendResponse(state);
                return true;
            }
            return true; 
        });
    }

    detectLLM() {
        const hostPatterns = {
            'chatgpt': /chat\.openai\.com|chatgpt\.com/,
            'claude': /claude\.ai|anthropic\.com|claude\.google\.com/,
            'gemini': /gemini\.google\.com\/app/,
            'grok': /x\.com|x\.grok\.ai/,
            'deepseek': /chat\.deepseek\.com|deepseek\.com/,
            'kimi': /kimi\.ai/,
            'qwen': /aliyun\.com|alibaba\.com/
        };
        
        const match = Object.entries(hostPatterns).find(([_, pattern]) => 
            pattern.test(window.location.hostname));
        
        const detected = match ? match[0] : 'unknown';
        console.log('Detected LLM:', detected);
        return detected;
    }

    getElementPriority(element) {
        
        try {
            if (!element) return 0;
        
            let score = 0;
            
            
            if (element.classList.contains('message-content')) score += 5;
            if (element.classList.contains('user-message')) score += 3;
            if (element.classList.contains('ai-message')) score += 3;
            if (element.getAttribute('data-message-author-role')) score += 4;
            
            
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
                score -= 10;
            }
            
            // Check for content
            if (element.textContent.trim().length > 0) score += 2;
            
            return score;
        } catch (error) {
            console.error('Error in getElementPriority:', error);
            return 0;
        }
    }

    async getCurrentContext() {
        try {
            console.log('Getting current context...');
            const rawContext = this.getRawContext();
            console.log('Raw context length:', rawContext?.length);
            
            if (this.summarizer) {
                console.log('Summarizer exists, attempting summarization');
                const summarizedContext = await this.summarizer.summarize(rawContext);
                console.log('Summarization complete:', 
                    summarizedContext?.substring(0, 100) + '...');
                return summarizedContext;
            } else {
                console.log('No summarizer available');
                return rawContext;
            }
        } catch (error) {
            console.error('Detailed context error:', error);
            return '';
        }
    }

    async init() {
        if (this.initialized) return;
        
        try {
            console.log('LLMMonitor initializing...');
            await this.loadDynamicSelectors();
            this.startMonitoring();
            this.setupSelectorRefresh();
            this.setupSPAHandler();

            const llmType = this.detectLLM();
            if (llmType) {
                this.sendUpdate('init', '');
            }

            this.initialized = true;
            console.log('LLMMonitor initialized successfully');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.loadFallbackSelectors();
        }
    }

    loadFallbackSelectors() {
        console.log('Loading fallback selectors');
        this.config = {
            inputSelectors: [
                { platform: "chatgpt", selector: "textarea[data-testid='message-input']" },
                { platform: "claude", selector: "div[role='textbox']" },
                { platform: "gemini", selector: "textarea[aria-label~='Chat input']" },
                { platform: "grok", selector: "textarea[placeholder*='Type your message']" },
                { platform: "kimi", selector: "textarea.chat-input" },
                { platform: "qwen", selector: "textarea.prompt-textarea" },
                { platform: "deepseek", selector: "textarea#chat-input" }
            ],
            outputSelectors: [
                { platform: "chatgpt", selector: "div[data-message-author-role='assistant'], div[data-message-author-role='user']" },
                { platform: "claude", selector: "div.prose, div.user-message" },
                { platform: "gemini", selector: "div.response-content, div.user-content" },
                { platform: "grok", selector: "div.message-content" },
                { platform: "kimi", selector: "div.message-bubble" },
                { platform: "qwen", selector: "div.response-message" },
                { platform: "deepseek", selector: ".message-content .message-text, .message-content .user-message" }
            ]
        };
        console.log('Fallback selectors loaded:', this.config);

        // console for deepseek
        if (window.location.hostname.includes('deepseek')) {
            console.log('On Deepseek, searching for elements...');
            const elements = document.querySelectorAll('.message-content .message-text, .message-content .user-message');
            console.log(`Found ${elements.length} message elements`);
            elements.forEach((el, i) => {
                const role = el.closest('.message-content').classList.contains('user-message') ? 'User' : 'Assistant';
                console.log(`${role} message ${i}:`, el.textContent.trim().slice(0, 100));
            });
        }
    }

    sendUpdate() {
        try {
            const llmType = this.detectLLM();
            const content = this.getCurrentContext();
            
            if (!content) {
                console.log('No content to send');
                return;
            }

            const message = {
                type: 'CONTEXT_UPDATE',
                data: {
                    llmType,
                    content
                }
            };

            // sending to bg.js
            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) {
                    console.log('Send update error:', chrome.runtime.lastError.message);
                } else {
                    console.log('Update sent successfully');
                }
            });
        } catch (error) {
            console.error('Error sending update:', error);
        }
    }

    async loadDynamicSelectors() {
        try {

            this.loadFallbackSelectors();
            return;
        } catch (error) {
            console.error('Failed to load dynamic selectors:', error);
            this.loadFallbackSelectors();
        }
    }
  
    startMonitoring() {
      this.setupInputMonitoring();
      this.setupOutputMonitoring();
    }
  
    setupInputMonitoring() {
      const inputHandler = this.debounce((element) => {
        const content = this.getInputContent(element);
        if (content) {
          this.sendUpdate('input', content);
        }
      }, this.config.debounce);
  
      this.createObserver('input', this.config.inputSelectors, (element) => {
        element.addEventListener('input', () => inputHandler(element));
        element.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) inputHandler(element)
        });
      });
    }
  
    setupOutputMonitoring() {
      this.createObserver('output', this.config.outputSelectors, (element) => {
        if (!this.observedElements.has(element)) {
          const content = this.getOutputContent(element);
          if (content) {
            this.sendUpdate('output', content);
            this.observedElements.set(element, content);
          }
        }
      });
    }
  
    createObserver(type, selectors, callback) {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          selectors.forEach(({ selector, priority }) => {
            const elements = [...document.querySelectorAll(selector)];
            elements.sort((a, b) => this.getElementPriority(a) - this.getElementPriority(b));
            elements.forEach(callback);
          });
        });
      });
  
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
    }
  
    getInputContent(element) {
      try {
        return element.value || element.textContent;
      } catch (error) {
        console.error('Input content extraction failed:', error);
        return null;
      }
    }
  
    getOutputContent(element) {
     
      try {
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.hidden, script, style').forEach(n => n.remove());
        return clone.textContent.trim();
      } catch (error) {
        console.error('Output content extraction failed:', error);
        return null;
      }
    }
  
    debounce(fn, delay) {
      return (...args) => {
        clearTimeout(this.debounceTimers.get(fn));
        this.debounceTimers.set(fn, setTimeout(() => fn(...args), delay));
      };
    }
  
    setupSelectorRefresh() {
      setInterval(() => this.loadDynamicSelectors(), this.config.selectorRefreshInterval);
    }
  
    setupSPAHandler() {
      let currentPath = location.pathname;
      const observer = new MutationObserver(() => {
        if (location.pathname !== currentPath) {
          currentPath = location.pathname;
          this.handleRouteChange();
        }
      });
      
      observer.observe(document, { subtree: true, childList: true });
    }
  
    handleRouteChange() {
      this.observedElements = new WeakMap();
      this.startMonitoring();
    }
  
    // encryptContent(text) {
    //   return text; 
    // }
  
    // queueRetry(payload) {
    
    // } optional, see later
}
  

console.log('Content script loading...');
const monitor = new LLMMonitor();

setTimeout(() => {
    console.log('Initializing monitor...');
    monitor.init().catch(error => {
        console.error('Monitor initialization failed:', error);
    });
}, 100);

window.llmMonitor = monitor;