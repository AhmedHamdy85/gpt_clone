document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const generateBtn = document.getElementById('generate-btn');
    const promptInput = document.getElementById('prompt-input');
    const chatContainer = document.getElementById('chat-container');
    const welcomeScreen = document.getElementById('welcome-screen');
    const maxLengthInput = document.getElementById('max-length');
    const temperatureInput = document.getElementById('temperature');
    const tempValue = document.getElementById('temp-value');
    const apiStatus = document.getElementById('api-status');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatsList = document.getElementById('chats-list');
    const exampleBtns = document.querySelectorAll('.example-btn');
    const typingIndicator = document.getElementById('typing-indicator');
    
    // New UI elements for file uploads
    const fileInput = document.getElementById('file-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const attachBtn = document.getElementById('attach-btn');
    
    // Model selection elements
    const modelSelect = document.getElementById('model-select');
    const textModelSettings = document.getElementById('text-model-settings');
    const imageModelSettings = document.getElementById('image-model-settings');
    const imageSizeSelect = document.getElementById('image-size');
    
    // Model info tooltip elements
    const modelInfoBtn = document.getElementById('model-info-btn');
    const modelInfoTooltip = document.getElementById('model-info-tooltip');
    
    // State
    let currentChatId = null;
    let chats = {};
    let isContinuing = false;
    let continueFromMessageId = null;
    let currentAttachment = null;
    
    // Initialize
    initApp();
    
    function initApp() {
        // Load chats from localStorage
        loadChats();
        
        // Check API status
        checkApiStatus();
        
        // Set up event listeners
        setupEventListeners();
        
        // Auto-resize textarea
        setupTextareaResize();
    }
    
    // Function to setup textarea auto-resize
    function setupTextareaResize() {
        if (promptInput) {
            promptInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        }
    }
    
    function setupEventListeners() {
        // Update temperature display value
        temperatureInput.addEventListener('input', () => {
            tempValue.textContent = temperatureInput.value;
        });
        
        // Generate button click
        generateBtn.addEventListener('click', handleGenerateClick);
        
        // New chat button click
        newChatBtn.addEventListener('click', createNewChat);
        
        // Example buttons
        exampleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const examplePrompt = btn.getAttribute('data-prompt');
                promptInput.value = examplePrompt;
                handleGenerateClick();
            });
        });
        
        // Allow submitting with Enter key (but Shift+Enter for new lines)
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerateClick();
            }
        });
        
        // File attachment button
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // File input change
        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelect);
        }
        
        // Model selection change
        if (modelSelect) {
            modelSelect.addEventListener('change', handleModelChange);
        }
        
        // Model info tooltip
        if (modelInfoBtn && modelInfoTooltip) {
            modelInfoBtn.addEventListener('click', () => {
                if (modelInfoTooltip.style.display === 'none') {
                    modelInfoTooltip.style.display = 'block';
                    // Add a small animation
                    modelInfoTooltip.style.opacity = '0';
                    modelInfoTooltip.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        modelInfoTooltip.style.opacity = '1';
                        modelInfoTooltip.style.transform = 'translateY(0)';
                    }, 10);
                } else {
                    hideModelTooltip();
                }
            });
            
            // Close tooltip when clicking outside
            document.addEventListener('click', (event) => {
                if (modelInfoTooltip.style.display === 'block' && 
                    !modelInfoTooltip.contains(event.target) && 
                    event.target !== modelInfoBtn) {
                    hideModelTooltip();
                }
            });
        }
    }
    
    // Handle model change
    function handleModelChange() {
        const selectedModel = modelSelect.value;
        
        // Update UI based on selected model
        if (selectedModel === 'dall-e-2') {
            // Show image generation settings, hide text settings
            if (textModelSettings) textModelSettings.style.display = 'none';
            if (imageModelSettings) imageModelSettings.style.display = 'flex';
            
            // Change placeholder text for image generation
            promptInput.placeholder = 'Describe an image to generate...';
        } else {
            // Show text settings, hide image settings
            if (textModelSettings) textModelSettings.style.display = 'flex';
            if (imageModelSettings) imageModelSettings.style.display = 'none';
            
            // Reset placeholder for text generation
            promptInput.placeholder = 'Send a message...';
        }
    }
    
    async function handleGenerateClick() {
        const prompt = promptInput.value.trim();
        const selectedModel = modelSelect ? modelSelect.value : 'gpt-4o-mini'; // Updated default model
        
        if (!prompt && !isContinuing && !currentAttachment) return;
        
        // Special case for DALL-E
        if (selectedModel === 'dall-e-2') {
            await handleImageGeneration(prompt);
            return;
        }
        
        // Rest of the function for text generation
        // Collect context if continuing
        let context = [];
        let finalPrompt = prompt;
        
        if (isContinuing && continueFromMessageId && chats[currentChatId]) {
            // Find the index of the message to continue from
            const messages = chats[currentChatId].messages;
            const messageIndex = messages.findIndex(msg => msg.id === continueFromMessageId);
            
            if (messageIndex !== -1) {
                // Get all messages up to and including the one to continue from
                context = messages.slice(0, messageIndex + 1);
                
                // Set a default prompt for continuation if none provided
                if (!prompt) {
                    finalPrompt = "Please continue.";
                }
            }
        }
        
        // Add user message to chat if not continuing or if prompt is provided during continuation
        if (!isContinuing || prompt) {
            addMessageToUI(finalPrompt, 'user');
            saveMessageToChat(currentChatId, finalPrompt, 'user');
        }
        
        // Reset continuing state
        isContinuing = false;
        continueFromMessageId = null;
        
        // Disable button and show loading state
        setLoadingState(true);
        
        // Show typing indicator
        showTypingIndicator(true);
        
        // Prepare the payload
        const payload = {
            prompt: finalPrompt,
            context: context.map(msg => ({ text: msg.text, sender: msg.sender })),
            max_length: parseInt(maxLengthInput.value),
            temperature: parseFloat(temperatureInput.value)
        };
        
        // Add attachment if present
        if (currentAttachment) {
            if (currentAttachment.type === 'image') {
                payload.image = currentAttachment.data;
                // Create the message with the image in a more visually appealing way
                addMessageWithImage(finalPrompt, currentAttachment.data, currentAttachment.name, 'user');
            } else if (currentAttachment.type === 'file') {
                payload.file = {
                    name: currentAttachment.name,
                    url: currentAttachment.url,
                    path: currentAttachment.filepath,
                    type: currentAttachment.file_type,
                    size: currentAttachment.size
                };
                
                // Add enhanced file attachment to UI
                addFileAttachmentToUI(
                    currentAttachment.name,
                    finalPrompt, 
                    'user',
                    currentAttachment.file_type,
                    currentAttachment.size,
                    currentAttachment.url
                );
            }
            
            // Reset attachment after sending
            resetAttachment();
        }
        
        try {
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);  // 60 second timeout
            
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await response.json();
            
            if (data.error) {
                let errorMessage = `Error: ${data.error}`;
                
                // Check for billing limit error and add more helpful information
                if (data.details) {
                    errorMessage += `\n\n${data.details}`;
                }
                
                if (data.resolution) {
                    errorMessage += `\n\n${data.resolution}`;
                }
                
                addMessageToUI(errorMessage, 'bot');
                saveMessageToChat(currentChatId, errorMessage, 'bot');
                
                if (response.status === 402) {
                    // Billing error - show special UI indicator
                    updateApiStatus('billing-limit');
                    showBillingLimitNotice();
                } else {
                    updateApiStatus('offline');
                }
            } else {
                addMessageToUI(data.response, 'bot');
                saveMessageToChat(currentChatId, data.response, 'bot');
                updateApiStatus('online');
                
                // Update chat title with first prompt - but only after the first exchange
                if (chats[currentChatId].messages.length === 2) {
                    updateChatTitle(currentChatId, getChattitle(finalPrompt));
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                addMessageToUI(`Error: Request timed out. The server might be overloaded.`, 'bot');
                saveMessageToChat(currentChatId, `Error: Request timed out.`, 'bot');
            } else if (error.message && error.message.includes('does not have access to model')) {
                // Handle model access errors
                handleModelNotAvailableError(error.message, selectedModel);
            } else {
                addMessageToUI(`Error: Could not connect to the server.`, 'bot');
                saveMessageToChat(currentChatId, `Error: Could not connect to the server.`, 'bot');
            }
            updateApiStatus('offline');
            
            // Try to restore connection
            if (typeof checkServerConnection === 'function') {
                setTimeout(() => checkServerConnection(), 1000);
            }
        } finally {
            showTypingIndicator(false);
            setLoadingState(false);
            promptInput.value = '';
            promptInput.style.height = 'auto';
            saveChatToStorage();
        }
    }
    
    // New function to handle image generation with DALL-E
    async function handleImageGeneration(prompt) {
        if (!prompt) return;
        
        // Create a new chat if none exists - always with title "New Chat"
        if (!currentChatId) {
            createNewChat();  // Use default title "New Chat"
        }
        
        // Show chat container
        showChatView();
        
        // Add user message to UI
        addMessageToUI(prompt, 'user');
        saveMessageToChat(currentChatId, prompt, 'user');
        
        // Set loading state
        setLoadingState(true);
        
        // Show typing indicator
        showTypingIndicator(true);
        
        try {
            // Send request to generate image
            const response = await fetch('/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    size: imageSizeSelect.value,
                    model: 'dall-e-2'
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                let errorMessage = `Error: ${data.error}`;
                
                // Check for billing limit error and add more helpful information
                if (data.details) {
                    errorMessage += `\n\n${data.details}`;
                }
                
                if (data.resolution) {
                    errorMessage += `\n\n${data.resolution}`;
                }
                
                addMessageToUI(errorMessage, 'bot');
                saveMessageToChat(currentChatId, errorMessage, 'bot');
                
                if (response.status === 402) {
                    // Billing error - show special UI indicator
                    updateApiStatus('billing-limit');
                    showBillingLimitNotice();
                } else {
                    updateApiStatus('offline');
                }
            } else {
                // Add the generated image to the UI
                addImageToUI(data.image_url, prompt, 'bot');
                saveMessageToChat(currentChatId, `Generated image: ${data.image_url}`, 'bot', true);
                updateApiStatus('online');
                
                // Update chat title with first prompt if this is the first message
                if (chats[currentChatId].messages.length <= 2) {
                    updateChatTitle(currentChatId, `Image: ${getChattitle(prompt)}`);
                }
            }
        } catch (error) {
            addMessageToUI(`Error: Could not generate image. Please try again later.`, 'bot');
            saveMessageToChat(currentChatId, `Error: Could not generate image.`, 'bot');
            updateApiStatus('offline');
        } finally {
            showTypingIndicator(false);
            setLoadingState(false);
            promptInput.value = '';
            promptInput.style.height = 'auto';
            saveChatToStorage();
        }
    }
    
    // Function to add a generated image to the UI
    function addImageToUI(imageUrl, promptText, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.setAttribute('data-message-id', Date.now().toString());
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Add prompt text
        const promptDiv = document.createElement('div');
        promptDiv.textContent = `"${promptText}"`;
        contentDiv.appendChild(promptDiv);
        
        // Add model badge
        const modelBadge = document.createElement('span');
        modelBadge.className = 'model-badge dall-e';
        modelBadge.textContent = 'DALL-E 2';
        contentDiv.appendChild(modelBadge);
        
        // Add image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'generated-image-container';
        
        // Add image
        const image = document.createElement('img');
        image.src = imageUrl;
        image.className = 'generated-image';
        image.alt = promptText;
        image.loading = 'lazy';
        imageContainer.appendChild(image);
        
        // Add image actions
        const imageActions = document.createElement('div');
        imageActions.className = 'image-actions';
        
        // Download button
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'action-btn';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        downloadBtn.href = imageUrl;
        downloadBtn.download = `dalle-image-${Date.now()}.png`;
        downloadBtn.target = '_blank';
        imageActions.appendChild(downloadBtn);
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy URL';
        copyBtn.addEventListener('click', () => copyTextToClipboard(imageUrl));
        imageActions.appendChild(copyBtn);
        
        imageContainer.appendChild(imageActions);
        contentDiv.appendChild(imageContainer);
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function addMessageToUI(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.setAttribute('data-message-id', Date.now().toString());
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Process message content - format code blocks if present
        if (sender === 'bot') {
            contentDiv.innerHTML = formatMessageWithCodeBlocks(text);
            
            // Initialize syntax highlighting for code blocks
            if (window.hljs) {
                messageDiv.querySelectorAll('pre code').forEach((block) => {
                    window.hljs.highlightElement(block);
                });
            }
            
            // Add copy buttons to code blocks
            setupCodeBlockCopyButtons(contentDiv);
        } else {
            contentDiv.textContent = text;
        }
        
        // Add message actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
        copyBtn.addEventListener('click', () => copyTextToClipboard(text));
        
        actionsDiv.appendChild(copyBtn);
        
        // Add actions only for bot messages
        if (sender === 'bot') {
            const speakBtn = document.createElement('button');
            speakBtn.className = 'action-btn';
            speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> Speak';
            speakBtn.addEventListener('click', () => speakText(text));
            
            const continueBtn = document.createElement('button');
            continueBtn.className = 'action-btn continue-btn';
            continueBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i> Continue';
            continueBtn.addEventListener('click', () => {
                const messageId = parseInt(messageDiv.getAttribute('data-message-id'));
                handleContinue(messageId);
            });
            
            actionsDiv.appendChild(speakBtn);
            actionsDiv.appendChild(continueBtn);
        }
        
        contentDiv.appendChild(actionsDiv);
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // Format message with code blocks
    function formatMessageWithCodeBlocks(text) {
        // Regex to match markdown code blocks
        const codeBlockRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
        
        // Replace code blocks with HTML
        let formattedText = text.replace(codeBlockRegex, (match, language, code) => {
            language = language || 'plaintext';
            return `
                <div class="code-header">
                    <span class="language-tag">${language}</span>
                    <button class="copy-code-btn" data-code="${encodeURIComponent(code.trim())}">
                        <i class="fas fa-copy"></i> Copy code
                    </button>
                </div>
                <pre><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>
            `;
        });
        
        // Format inline code with backticks
        formattedText = formattedText.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Convert line breaks to <br> tags
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        return formattedText;
    }
    
    // Setup code block copy buttons
    function setupCodeBlockCopyButtons(container) {
        const copyButtons = container.querySelectorAll('.copy-code-btn');
        
        copyButtons.forEach(button => {
            button.addEventListener('click', function() {
                const code = decodeURIComponent(this.getAttribute('data-code'));
                copyTextToClipboard(code);
                
                // Show success feedback
                const successMsg = document.createElement('span');
                successMsg.className = 'copy-success';
                successMsg.textContent = 'Copied!';
                
                // Add to parent pre element
                const pre = this.closest('.code-header').nextElementSibling;
                pre.appendChild(successMsg);
                
                // Show message
                setTimeout(() => {
                    successMsg.classList.add('visible');
                }, 10);
                
                // Hide message
                setTimeout(() => {
                    successMsg.classList.remove('visible');
                    setTimeout(() => successMsg.remove(), 300);
                }, 1500);
            });
        });
    }
    
    // Copy text to clipboard
    function copyTextToClipboard(text) {
        navigator.clipboard.writeText(text).then(
            () => console.log('Text copied to clipboard'),
            (err) => console.error('Could not copy text: ', err)
        );
    }
    
    // Text to speech
    function speakText(text) {
        // Remove code blocks for speech
        const textWithoutCodeBlocks = text.replace(/```[\s\S]*?```/g, 'Code block omitted for speech.');
        
        // Use browser's speech synthesis
        const utterance = new SpeechSynthesisUtterance(textWithoutCodeBlocks);
        window.speechSynthesis.speak(utterance);
    }
    
    // Escape HTML to prevent XSS
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")  // Fixed: was incorrectly using /<//g which causes a syntax error
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Show or hide typing indicator
    function showTypingIndicator(show) {
        if (show) {
            typingIndicator.classList.add('active');
        } else {
            typingIndicator.classList.remove('active');
        }
    }
    
    function createNewChat(title = 'New Chat') {
        // Generate a new chat ID
        const chatId = 'chat_' + Date.now();
        
        // Create chat object - Always use "New Chat" as the default title 
        chats[chatId] = {
            id: chatId,
            title: 'New Chat', // Always set to "New Chat"
            timestamp: Date.now(),
            messages: []
        };
        
        // Update current chat
        currentChatId = chatId;
        
        // Add to sidebar
        addChatToSidebar(chatId, 'New Chat'); // Use "New Chat" here
        
        // Clear chat view
        clearChatView();
        
        // Show empty chat, hide welcome
        showChatView();
        
        // Save to storage
        saveChatToStorage();
        
        return chatId;
    }
    
    function addChatToSidebar(chatId, title) {
        // First remove 'active' class from any existing chats
        const activeChatItems = chatsList.querySelectorAll('.chat-item.active');
        activeChatItems.forEach(item => item.classList.remove('active'));
        
        // Create new chat item
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item active';
        chatItem.setAttribute('data-chat-id', chatId);
        chatItem.innerHTML = `
            <i class="fas fa-message"></i>
            <span>${title}</span>
        `;
        
        // Add click event to load this chat
        chatItem.addEventListener('click', () => {
            loadChat(chatId);
        });
        
        // Add to list (at the beginning)
        if (chatsList.firstChild) {
            chatsList.insertBefore(chatItem, chatsList.firstChild);
        } else {
            chatsList.appendChild(chatItem);
        }
    }
    
    function saveMessageToChat(chatId, text, sender, isImage = false) {
        if (!chats[chatId]) return;
        
        chats[chatId].messages.push({
            id: Date.now(),
            text: text,
            sender: sender,
            timestamp: Date.now(),
            isImage: isImage  // Add flag for image messages
        });
    }
    
    // Also modify the updateChatTitle function to only update the title when it's not the initial message
    function updateChatTitle(chatId, title) {
        if (!chats[chatId]) return;
        
        // Only update if this is not the first message, to keep "New Chat" as title until a message is sent
        if (chats[chatId].messages.length > 2) {
            chats[chatId].title = title;
            
            // Update sidebar
            const chatItem = chatsList.querySelector(`[data-chat-id="${chatId}"]`);
            if (chatItem) {
                const titleSpan = chatItem.querySelector('span');
                if (titleSpan) titleSpan.textContent = title;
            }
        }
    }
    
    function getChattitle(prompt) {
        // Create a title from the first few words of the prompt
        const words = prompt.split(' ');
        let title = words.slice(0, 4).join(' ');
        
        if (title.length > 25) {
            title = title.substring(0, 22) + '...';
        } else if (words.length > 4) {
            title += '...';
        }
        
        return title;
    }
    
    function showChatView() {
        welcomeScreen.style.display = 'none';
        chatContainer.style.display = 'block';
    }
    
    function showWelcomeView() {
        welcomeScreen.style.display = 'flex';
        chatContainer.style.display = 'none';
        currentChatId = null;
    }
    
    function clearChatView() {
        chatContainer.innerHTML = '';
    }
    
    function setLoadingState(isLoading) {
        generateBtn.disabled = isLoading;
        if (isLoading) {
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            generateBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
    
    function loadChats() {
        try {
            const storedChats = localStorage.getItem('gpt_clone_chats');
            if (storedChats) {
                chats = JSON.parse(storedChats);
                
                // Add chats to sidebar (most recent first)
                Object.values(chats)
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .forEach(chat => {
                        addChatToSidebar(chat.id, chat.title);
                    });
            }
        } catch (error) {
            console.error('Failed to load chats:', error);
        }
    }
    
    function saveChatToStorage() {
        try {
            localStorage.setItem('gpt_clone_chats', JSON.stringify(chats));
        } catch (error) {
            console.error('Failed to save chats:', error);
        }
    }
    
    async function checkApiStatus() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);  // 5 second timeout
            
            const response = await fetch('/health', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                updateApiStatus('online');
                return true;
            } else {
                updateApiStatus('offline');
                return false;
            }
        } catch (error) {
            console.error('API status check error:', error);
            updateApiStatus('offline');
            return false;
        }
    }
    
    function updateApiStatus(status) {
        apiStatus.textContent = `API: ${status === 'online' ? 'Connected' : 
                                   status === 'billing-limit' ? 'Billing Limit Reached' : 
                                   'Disconnected'}`;
        apiStatus.className = `api-status ${status}`;
        
        // Update UI if status changes
        if (window.updateConnectionStatus) {
            window.updateConnectionStatus(status === 'online');
        }
    }
    
    function loadChat(chatId) {
        if (!chats[chatId]) return;
        
        // Set current chat ID
        currentChatId = chatId;
        
        // Remove 'active' class from all chat items
        const allChatItems = chatsList.querySelectorAll('.chat-item');
        allChatItems.forEach(item => item.classList.remove('active'));
        
        // Add 'active' class to selected chat
        const selectedChat = chatsList.querySelector(`[data-chat-id="${chatId}"]`);
        if (selectedChat) {
            selectedChat.classList.add('active');
        }
        
        // Clear the chat view
        clearChatView();
        
        // Display messages for this chat
        if (chats[chatId].messages && chats[chatId].messages.length > 0) {
            chats[chatId].messages.forEach(msg => {
                addMessageToUI(msg.text, msg.sender);
            });
            
            // Show chat view
            showChatView();
        } else {
            // Show empty chat
            showChatView();
        }
    }
    
    function handleContinue(messageId) {
        if (!currentChatId) return;
        
        isContinuing = true;
        continueFromMessageId = messageId;
        
        // Focus on the input
        promptInput.focus();
        
        // Optionally add a hint in the input
        if (promptInput.value.trim() === '') {
            promptInput.placeholder = 'Continue from previous message...';
            setTimeout(() => {
                promptInput.placeholder = 'Send a message...';
            }, 3000);
        }
    }
    
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected");
            return;
        }
        
        console.log(`File selected: ${file.name} (${formatFileSize(file.size)})`);
        
        // Check file size (increased to 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert(`File is too large. Maximum file size is ${formatFileSize(maxSize)}.`);
            fileInput.value = '';
            return;
        }
        
        // Enhanced file type checking
        const acceptedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'text/plain', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv', 'text/markdown', 'application/json'
        ];
        
        if (!acceptedTypes.includes(file.type)) {
            alert('File type not supported. Please upload an image, document, or text file.');
            fileInput.value = '';
            return;
        }
        
        // Show upload progress indicator
        showUploadProgress(true, 0);
        
        // For images, show preview
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentAttachment = {
                    type: 'image',
                    name: file.name,
                    data: e.target.result,
                    size: file.size,
                    file_type: file.type
                };
                showAttachmentPreview(file.name, e.target.result, file.type, null, file.size);
                showUploadProgress(false);
            };
            reader.readAsDataURL(file);
        } else {
            // For other files
            let iconClass = getFileIconClass(file.type, file.name);
            
            // Upload the file to the server with progress tracking
            uploadFile(file)
                .then(() => {
                    showUploadProgress(false);
                })
                .catch(error => {
                    showUploadProgress(false);
                    console.error('Error uploading file:', error);
                    alert('Error uploading file: ' + error.message);
                    fileInput.value = '';
                });
            
            // Show immediate feedback while uploading
            currentAttachment = {
                type: 'file',
                name: file.name,
                size: file.size,
                file_type: file.type
            };
            
            showAttachmentPreview(file.name, null, file.type, iconClass, file.size);
        }
    }
    
    // Format file size for display
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
    
    // Determine appropriate icon based on file type and extension
    function getFileIconClass(mimeType, filename) {
        // Extract extension from filename
        const ext = filename.split('.').pop().toLowerCase();
        
        // Image files
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        
        // PDF files
        if (mimeType === 'application/pdf') return 'fa-file-pdf';
        
        // Text files
        if (mimeType === 'text/plain') return 'fa-file-alt';
        if (mimeType === 'text/markdown' || ext === 'md') return 'fa-file-alt';
        if (mimeType === 'text/csv' || ext === 'csv') return 'fa-file-csv';
        if (mimeType === 'application/json' || ext === 'json') return 'fa-file-code';
        
        // Word documents
        if (mimeType === 'application/msword' || 
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            ext === 'doc' || ext === 'docx') 
            return 'fa-file-word';
        
        // Excel files
        if (mimeType === 'application/vnd.ms-excel' || 
            mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            ext === 'xls' || ext === 'xlsx') 
            return 'fa-file-excel';
        
        // Default file icon
        return 'fa-file';
    }
    
    // Show upload progress indicator
    function showUploadProgress(show, progress = 0) {
        let progressElement = document.getElementById('upload-progress');
        
        if (!progressElement && show) {
            progressElement = document.createElement('div');
            progressElement.id = 'upload-progress';
            progressElement.className = 'upload-progress';
            
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            
            const progressText = document.createElement('div');
            progressText.className = 'progress-text';
            progressText.textContent = 'Uploading...';
            
            progressElement.appendChild(progressBar);
            progressElement.appendChild(progressText);
            
            document.body.appendChild(progressElement);
        }
        
        if (progressElement) {
            if (show) {
                progressElement.style.display = 'flex';
                const progressBar = progressElement.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${progress}%`;
                }
            } else {
                progressElement.style.display = 'none';
            }
        }
    }
    
    function showAttachmentPreview(filename, dataUrl, fileType, iconClass = null, fileSize = 0) {
        if (!attachmentPreview) return;
        
        attachmentPreview.innerHTML = '';
        attachmentPreview.style.display = 'flex';
        
        const previewContainer = document.createElement('div');
        previewContainer.className = 'attachment-item';
        
        // Image preview
        if (fileType.startsWith('image/') && dataUrl) {
            const img = document.createElement('img');
            img.className = 'attachment-image';
            img.src = dataUrl;
            previewContainer.appendChild(img);
        } else {
            // File icon
            const icon = document.createElement('i');
            icon.className = `fas ${iconClass || 'fa-file'}`;
            icon.style.fontSize = '24px';
            previewContainer.appendChild(icon);
        }
        
        const fileDetails = document.createElement('div');
        fileDetails.className = 'attachment-details';
        
        // File name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'attachment-name';
        nameSpan.textContent = filename;
        fileDetails.appendChild(nameSpan);
        
        // File size if available
        if (fileSize > 0) {
            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'attachment-size';
            sizeSpan.textContent = formatFileSize(fileSize);
            fileDetails.appendChild(sizeSpan);
        }
        
        previewContainer.appendChild(fileDetails);
        
        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'attachment-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
            attachmentPreview.style.display = 'none';
            currentAttachment = null;
            fileInput.value = '';
        });
        previewContainer.appendChild(removeBtn);
        
        attachmentPreview.appendChild(previewContainer);
    }
    
    // Upload file with improved error handling and retry logic
    async function uploadFile(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            // Setup XHR for progress tracking
            const xhr = new XMLHttpRequest();
            
            // Track upload progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    showUploadProgress(true, percentComplete);
                    console.log(`Upload progress: ${percentComplete}%`);
                }
            };
            
            let retries = 0;
            const maxRetries = 2;
            
            const attemptUpload = () => {
                xhr.open('POST', '/upload', true);
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const result = JSON.parse(xhr.responseText);
                            console.log("Upload successful:", result);
                            
                            if (result.url) {
                                currentAttachment = {
                                    type: 'file',
                                    name: file.name,
                                    original_filename: file.name,
                                    url: result.url,
                                    filepath: result.filepath,
                                    size: result.size || file.size,
                                    file_type: result.type || file.type,
                                    timestamp: result.timestamp || new Date().toISOString()
                                };
                                resolve(result);
                            } else {
                                reject(new Error('Server response missing URL'));
                            }
                        } catch (error) {
                            console.error("Error parsing server response:", error);
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        console.error(`Upload failed with status: ${xhr.status}`);
                        
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            if (retries < maxRetries) {
                                retries++;
                                console.log(`Retrying upload (${retries}/${maxRetries})...`);
                                setTimeout(attemptUpload, 1000 * retries);
                            } else {
                                reject(new Error(errorResponse.error || `Failed with status ${xhr.status}`));
                            }
                        } catch {
                            reject(new Error(`Server error (${xhr.status})`));
                        }
                    }
                };
                
                xhr.onerror = function() {
                    console.error("Network error during file upload");
                    if (retries < maxRetries) {
                        retries++;
                        console.log(`Retrying upload after network error (${retries}/${maxRetries})...`);
                        setTimeout(attemptUpload, 1000 * retries);
                    } else {
                        reject(new Error('Network error during file upload'));
                    }
                };
                
                xhr.ontimeout = function() {
                    console.error("Upload request timed out");
                    if (retries < maxRetries) {
                        retries++;
                        console.log(`Retrying upload after timeout (${retries}/${maxRetries})...`);
                        setTimeout(attemptUpload, 1000 * retries);
                    } else {
                        reject(new Error('Upload timed out'));
                    }
                };
                
                xhr.timeout = 30000; // 30 second timeout
                xhr.send(formData);
            };
            
            // Start the upload
            attemptUpload();
        });
    }
    
    function addFileAttachmentToUI(filename, text, sender, fileType = '', fileSize = 0, fileUrl = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Add the message text if provided
        if (text) {
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.textContent = text;
            contentDiv.appendChild(textDiv);
        }
        
        // Add file attachment indicator with enhanced styling
        const attachmentIndicator = document.createElement('div');
        attachmentIndicator.className = 'file-attachment';
        
        // Choose appropriate icon
        const fileIcon = document.createElement('i');
        let iconClass = getFileIconClass(fileType, filename);
        fileIcon.className = `fas ${iconClass}`;
        attachmentIndicator.appendChild(fileIcon);
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = filename;
        fileInfo.appendChild(fileName);
        
        // Add file size if available
        if (fileSize > 0) {
            const fileSizeElem = document.createElement('div');
            fileSizeElem.className = 'file-size';
            fileSizeElem.textContent = formatFileSize(fileSize);
            fileInfo.appendChild(fileSizeElem);
        }
        
        attachmentIndicator.appendChild(fileInfo);
        
        // Add actions for the file
        const fileActions = document.createElement('div');
        fileActions.className = 'file-actions';
        
        if (fileUrl) {
            // Download button if URL is available
            const downloadBtn = document.createElement('a');
            downloadBtn.className = 'file-action-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = 'Download file';
            downloadBtn.href = fileUrl;
            downloadBtn.target = '_blank';
            downloadBtn.download = filename;
            fileActions.appendChild(downloadBtn);
            
            // Preview button for supported file types
            if (fileType.startsWith('image/') || fileType === 'application/pdf' || fileType.startsWith('text/')) {
                const previewBtn = document.createElement('a');
                previewBtn.className = 'file-action-btn';
                previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
                previewBtn.title = 'Preview file';
                previewBtn.href = fileUrl;
                previewBtn.target = '_blank';
                fileActions.appendChild(previewBtn);
            }
        }
        
        attachmentIndicator.appendChild(fileActions);
        contentDiv.appendChild(attachmentIndicator);
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageDiv;
    }
    
    function resetAttachment() {
        currentAttachment = null;
        if (attachmentPreview) {
            attachmentPreview.style.display = 'none';
            attachmentPreview.innerHTML = '';
        }
        if (fileInput) {
            fileInput.value = '';
        }
    }
    
    function hideModelTooltip() {
        if (modelInfoTooltip) {
            modelInfoTooltip.style.opacity = '0';
            modelInfoTooltip.style.transform = 'translateY(10px)';
            setTimeout(() => {
                modelInfoTooltip.style.display = 'none';
            }, 300);
        }
    }
    
    // Show billing limit notice
    function showBillingLimitNotice() {
        const notice = document.createElement('div');
        notice.className = 'billing-limit-notice';
        notice.innerHTML = `
            <div class="billing-limit-content">
                <h3><i class="fas fa-exclamation-circle"></i> OpenAI API Billing Limit Reached</h3>
                <p>Your OpenAI API key has reached its billing limit or spending cap.</p>
                <p>To continue using this application:</p>
                <ol>
                    <li>Visit the <a href="https://platform.openai.com/usage" target="_blank">OpenAI dashboard</a></li>
                    <li>Check your current usage and billing status</li>
                    <li>Consider upgrading your plan or adding payment information</li>
                    <li>Update your API key in the application's .env file</li>
                </ol>
                <button class="billing-notice-close">Close</button>
            </div>
        `;
        
        document.body.appendChild(notice);
        
        // Add close functionality
        notice.querySelector('.billing-notice-close').addEventListener('click', () => {
            notice.style.opacity = '0';
            setTimeout(() => {
                notice.remove();
            }, 300);
        });
        
        // Fade in
        setTimeout(() => {
            notice.style.opacity = '1';
        }, 10);
    }
    
    // New function to add a message with an image
    function addMessageWithImage(text, imageData, imageName, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.setAttribute('data-message-id', Date.now().toString());
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (text) {
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.textContent = text;
            contentDiv.appendChild(textDiv);
        }
        
        // Add image in a container with enhanced styling
        const imageContainer = document.createElement('div');
        imageContainer.className = 'message-image-container';
        
        const image = document.createElement('img');
        image.className = 'message-image';
        image.src = imageData;
        image.alt = imageName || 'Attached image';
        image.loading = 'lazy';
        
        // Add click to expand functionality
        image.addEventListener('click', () => {
            showImageFullscreen(imageData, imageName);
        });
        
        imageContainer.appendChild(image);
        
        // Add image caption
        if (imageName) {
            const imageCaption = document.createElement('div');
            imageCaption.className = 'image-caption';
            imageCaption.textContent = imageName;
            imageContainer.appendChild(imageCaption);
        }
        
        contentDiv.appendChild(imageContainer);
        
        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageDiv;
    }
    
    // Show image in fullscreen overlay
    function showImageFullscreen(imageUrl, caption) {
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        
        const imageContainer = document.createElement('div');
        imageContainer.className = 'fullscreen-image-container';
        
        const image = document.createElement('img');
        image.className = 'fullscreen-image';
        image.src = imageUrl;
        image.alt = caption || 'Image';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'fullscreen-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
        
        // Close on click outside image
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
        
        imageContainer.appendChild(image);
        overlay.appendChild(imageContainer);
        overlay.appendChild(closeBtn);
        
        if (caption) {
            const captionDiv = document.createElement('div');
            captionDiv.className = 'fullscreen-caption';
            captionDiv.textContent = caption;
            overlay.appendChild(captionDiv);
        }
        
        document.body.appendChild(overlay);
    }
    
    // Add this function to show upload errors in the UI
    function showUploadError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'upload-error';
        errorDiv.textContent = message;
        
        // Style the error message
        Object.assign(errorDiv.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#f44336',
            color: 'white',
            padding: '15px 20px',
            borderRadius: '5px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: '10000',
            maxWidth: '80%'
        });
        
        document.body.appendChild(errorDiv);
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.style.opacity = '0';
            errorDiv.style.transform = 'translate(-50%, -20px)';
            errorDiv.style.transition = 'opacity 0.5s, transform 0.5s';
            
            setTimeout(() => {
                if (document.body.contains(errorDiv)) {
                    document.body.removeChild(errorDiv);
                }
            }, 500);
        }, 5000);
    }
    
    // New function to handle model not available error
    function handleModelNotAvailableError(error, modelName) {
        console.error(`Model access error: ${error}`);
        
        // Show a more helpful error message to the user
        const errorMessage = `The selected model "${modelName}" is not available with your current API key. 
        
The system will automatically try again with gpt-4o-mini instead.

To resolve this permanently:
1. Update your model selection to one of the available models:
   - gpt-4o-mini
   - o1-mini
   - dall-e-2`;
        
        addMessageToUI(errorMessage, 'bot');
        
        // Reset model selection to gpt-4o-mini
        if (modelSelect) {
            modelSelect.value = 'gpt-4o-mini';
        }
        
        // Try to handle with fallback model
        if (modelName !== 'gpt-4o-mini') {
            setTimeout(() => {
                // Re-attempt with default model
                handleGenerateClick();
            }, 2000);
        }
    }
});
