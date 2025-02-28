// content.js - Enhanced Professional Version
class LLMMonitor {
    constructor() {
        console.log('LLMMonitor constructor called');
        this.config = {
            inputSelectors: [],
            outputSelectors: []
        };
        this.initialized = false;
        
        // Setup message listeners immediately in constructor
        this.setupMessageHandlers();
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
            return true; // Keep channel open for async response
        });
    }

    detectLLM() {
        const hostPatterns = {
            'chatgpt': /chat\.openai\.com|chatgpt\.com/,
            'claude': /claude\.ai/,
            'gemini': /bard\.google\.com|gemini\.google\.com/,
            'grok': /x\.ai/,
            'kimi': /kimi\.ai/,
            'qwen': /aliyun\.com|alibaba\.com/,
            'deepseek': /deepseek\.com | chat\.deepseek\.com/
        };
        
        const match = Object.entries(hostPatterns).find(([_, pattern]) => 
            pattern.test(window.location.hostname));
        
        const detected = match ? match[0] : 'unknown';
        console.log('Detected LLM:', detected);
        return detected;
    }

    getCurrentContext() {
        try {
            const llmType = this.detectLLM();
            console.log('Getting context for LLM type:', llmType);
            
            const selector = this.config.outputSelectors.find(s => s.platform === llmType);
            console.log('Using selector:', selector);
            
            if (selector) {
                const elements = document.querySelectorAll(selector.selector);
                console.log(`Found ${elements.length} elements`);
                
                if (elements.length === 0) {
                    console.log('No message elements found');
                    return '';
                }

                // Convert elements to array and process them
                const messages = Array.from(elements).map(el => {
                    let role = 'Assistant';
                    // Detect if it's a user message based on attributes or classes
                    if (
                        el.getAttribute('data-message-author-role') === 'user' ||
                        el.classList.contains('user-message') ||
                        el.closest('.chat-message.user')
                    ) {
                        role = 'User';
                    }
                    return `${role}: ${el.textContent.trim()}`;
                }).filter(text => text.length > 0);

                console.log('Found messages:', messages.length);
                if (messages.length > 0) {
                    console.log('First message preview:', messages[0].slice(0, 100));
                }
                return messages.join('\n\n');
            }
            
            console.log('No selector found for LLM type:', llmType);
            return '';
        } catch (error) {
            console.error('Error getting current context:', error);
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
                { platform: "deepseek", selector: "textarea.prompt-textarea" }
            ],
            outputSelectors: [
                { platform: "chatgpt", selector: "div[data-message-author-role='assistant'], div[data-message-author-role='user']" },
                { platform: "claude", selector: "div.prose, div.user-message" },
                { platform: "gemini", selector: "div.response-content, div.user-content" },
                { platform: "grok", selector: "div.message-content" },
                { platform: "kimi", selector: "div.message-bubble" },
                { platform: "qwen", selector: "div.response-message" },
                { platform: "deepseek", selector: ".chat-message" }
            ]
        };
        console.log('Fallback selectors loaded:', this.config);

        // Add debug logging for Deepseek
        if (window.location.hostname.includes('deepseek')) {
            console.log('On Deepseek, available elements:');
            document.querySelectorAll('.message-content .content').forEach((el, i) => {
                console.log(`Element ${i}:`, el.textContent.trim().slice(0, 100));
            });
        }
    }

    sendUpdate(type, content) {
        try {
            if (!chrome?.runtime?.id) {
                console.warn('Extension context not available, update not sent');
                return;
            }

            const llmType = this.detectLLM();
            console.log('Sending update:', { type, content, llmType });
            
            chrome.runtime.sendMessage({
                type: 'CONTEXT_UPDATE',
                data: {
                    type,
                    content: content || '',
                    source: window.location.origin,
                    timestamp: Date.now(),
                    llmType
                }
            }, response => {
                if (chrome.runtime.lastError) {
                    console.warn('Send update error:', chrome.runtime.lastError);
                } else {
                    console.log('Update sent successfully');
                }
            });
        } catch (error) {
            console.error('Failed to send update:', error);
        }
    }

    async loadDynamicSelectors() {
      try {
        // Check if extension context is valid
        if (!chrome.runtime?.id) {
          throw new Error('Extension context invalid');
        }

        const url = chrome.runtime.getURL('selectors.json');
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        this.config.inputSelectors = data.inputs;
        this.config.outputSelectors = data.outputs;
        
        console.log('Dynamic selectors loaded successfully');
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
      // Advanced content extraction with error boundaries
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
  
    encryptContent(text) {
      // Implement crypto-js AES encryption
      return text; // Placeholder
    }
  
    queueRetry(payload) {
      // Implement exponential backoff retry logic
    }
}
  
// Create and initialize monitor immediately when script loads
console.log('Content script loading...');
const monitor = new LLMMonitor();

// Initialize after a short delay to ensure DOM is ready
setTimeout(() => {
    console.log('Initializing monitor...');
    monitor.init().catch(error => {
        console.error('Monitor initialization failed:', error);
    });
}, 100);

// Export for debugging
window.llmMonitor = monitor;