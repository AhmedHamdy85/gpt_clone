import os
import base64
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, url_for
import requests
import markdown
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.formatters import HtmlFormatter
from dotenv import load_dotenv
import json
from datetime import datetime
import shutil

# Load environment variables from .env file
load_dotenv()

# Get API key from environment variable
API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/chat/completions"

# Add configuration for file uploads
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
STATIC_UPLOAD_PATH = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx', 'xlsx', 'csv', 'md', 'json'}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB limit

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Ensure upload directories exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
    print(f"Created upload directory: {UPLOAD_FOLDER}")

static_upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), STATIC_UPLOAD_PATH)
if not os.path.exists(static_upload_dir):
    os.makedirs(static_upload_dir)
    print(f"Created static upload directory: {static_upload_dir}")

@app.route('/')
def home():
    """Render the home page"""
    return render_template('index.html')

def allowed_file(filename):
    """Check if the file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file uploads with improved error handling and metadata"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    try:
        if file and allowed_file(file.filename):
            # Create a unique filename with timestamp
            original_filename = secure_filename(file.filename)
            base, extension = os.path.splitext(original_filename)
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            safe_filename = f"{base}_{timestamp}{extension}"
            
            # Save to uploads directory
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
            file.save(filepath)
            
            # Copy to static folder for URL access
            static_filepath = os.path.join(static_upload_dir, safe_filename)
            try:
                shutil.copy2(filepath, static_filepath)
                print(f"File copied to static directory: {static_filepath}")
            except Exception as e:
                print(f"Warning: Could not copy file to static directory: {e}")
            
            # Get file info
            file_size = os.path.getsize(filepath)
            file_type = file.content_type or 'application/octet-stream'
            
            # Generate URL for the file
            file_url = url_for('static', filename=f'uploads/{safe_filename}', _external=True)
            
            print(f"File uploaded successfully: {safe_filename}, URL: {file_url}")
            
            return jsonify({
                'filename': safe_filename,
                'original_filename': original_filename,
                'filepath': filepath,
                'url': file_url,
                'size': file_size,
                'type': file_type,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/generate', methods=['POST'])
def generate_text():
    """Generate text based on the input prompt using an external API"""
    data = request.json
    prompt = data.get('prompt', '')
            
    # Default parameters
    max_length = data.get('max_length', 150)
    temperature = data.get('temperature', 0.7)
    context = data.get('context', [])
            
    # Get the selected model - use gpt-4o-mini or o1-mini as default
    model = data.get('model', 'gpt-4o-mini')
                
    # Check if there's an image attached
    image_data = data.get('image')
                
    # Format the complete prompt with context if provided
    complete_prompt = ""
    
    if context:
        # Build conversation history
        for message in context:
            if message['sender'] == 'user':
                complete_prompt += f"User: {message['text']}\n"
            else:
                complete_prompt += f"AI: {message['text']}\n"
        
        # Add the current prompt
        complete_prompt += f"User: {prompt}\nAI:"
    else:
        complete_prompt = prompt
    
    # Generate text using API
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        # For image inputs, use gpt-4o-mini which can handle images
        if image_data:
            payload = {
                "model": "gpt-4o-mini",  # Use gpt-4o-mini for image analysis
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": complete_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_data
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": max_length,
                "temperature": temperature
            }
            
            try:
                response = requests.post(API_URL, headers=headers, json=payload)
                response.raise_for_status()
            except requests.exceptions.RequestException as e:
                # No need for fallback since we're only using allowed models
                # Just re-raise the exception
                raise
        else:
            # Regular text-only payload with the selected model (gpt-4o-mini or o1-mini)
            payload = {
                "model": model,
                "messages": [
                    {"role": "user", "content": complete_prompt}
                ],
                "max_tokens": max_length,
                "temperature": temperature,
                "top_p": 1,
                "n": 1,
                "stream": False
            }
            
            response = requests.post(API_URL, headers=headers, json=payload)
            response.raise_for_status()
        
        result = response.json()
        generated_text = result['choices'][0]['message']['content']
        
        # Log the interaction (optional)
        try:
            log_interaction(prompt, generated_text)
        except Exception as e:
            print(f"Logging error: {str(e)}")
                
        return jsonify({'response': generated_text})
    
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        status_code = 500
        try:
            if hasattr(e, 'response') and e.response is not None:
                error_json = e.response.json()
                status_code = e.response.status_code
                
                if 'error' in error_json:
                    error_msg = error_json['error'].get('message', str(e))
                    
                    # Handle specific OpenAI API errors
                    if 'billing' in error_msg.lower() and 'limit' in error_msg.lower():
                        error_msg = "OpenAI API billing limit reached. Please check your API key's usage limits in your OpenAI account dashboard."
                        return jsonify({
                            'error': error_msg,
                            'details': "This usually means you've used all your API credits or reached a spending cap.",
                            'resolution': "Visit https://platform.openai.com/usage to check your usage and billing status."
                        }), 402  # 402 Payment Required
                        
                    elif 'rate' in error_msg.lower() and 'limit' in error_msg.lower():
                        return jsonify({
                            'error': "Rate limit exceeded. Please try again in a moment.",
                            'details': error_msg
                        }), 429  # 429 Too Many Requests
        except:
            pass
        
        return jsonify({'error': f"API Error: {error_msg}"}), status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/generate-image', methods=['POST'])
def generate_image():
    """Generate an image using DALL-E based on the prompt"""
    data = request.json
    prompt = data.get('prompt', '')
    size = data.get('size', '512x512')
    
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        
        # Fixed payload: Use proper model name "dall-e-2" instead of "gpt-4o-mini"
        payload = {
            "model": "dall-e-2",  # Correct model name for DALL-E 2
            "prompt": prompt,
            "n": 1,
            "size": size
        }
        
        # DALL-E API endpoint is different
        response = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json=payload
        )
        
        response.raise_for_status()
        result = response.json()
        image_url = result['data'][0]['url']
        
        # Log the interaction (optional)
        try:
            log_interaction(f"Image generation: {prompt}", f"Generated image: {image_url}")
        except Exception as e:
            print(f"Logging error: {str(e)}")
        
        return jsonify({'image_url': image_url})
    
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        status_code = 500
        try:
            if hasattr(e, 'response') and e.response is not None:
                error_json = e.response.json()
                status_code = e.response.status_code
                
                if 'error' in error_json:
                    error_msg = error_json['error'].get('message', str(e))
                    
                    # Handle specific OpenAI API errors for image generation
                    if 'billing' in error_msg.lower() and 'limit' in error_msg.lower():
                        error_msg = "OpenAI API billing limit reached. Please check your API key's usage limits in your OpenAI account dashboard."
                        return jsonify({
                            'error': error_msg,
                            'details': "This usually means you've used all your API credits or reached a spending cap.",
                            'resolution': "Visit https://platform.openai.com/usage to check your usage and billing status."
                        }), 402  # 402 Payment Required
        except:
            pass
            
        return jsonify({'error': f"API Error: {error_msg}"}), status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Add a route to list all files
@app.route('/files', methods=['GET'])
def list_files():
    """List all uploaded files"""
    files = []
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.isfile(filepath):
            file_url = url_for('static', filename=f'uploads/{filename}', _external=True)
            files.append({
                'filename': filename,
                'url': file_url,
                'size': os.path.getsize(filepath),
                'modified': os.path.getmtime(filepath)
            })
    
    return jsonify(files)

def log_interaction(prompt, response):
    """Log each interaction to a file (optional)"""
    log_dir = os.path.join(os.path.dirname(__file__), 'logs')
    
    # Create logs directory if it doesn't exist
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    log_file = os.path.join(log_dir, 'interactions.jsonl')
    
    # Append the interaction to the log file
    with open(log_file, 'a') as f:
        interaction = {
            'prompt': prompt,
            'response': response,
            'timestamp': datetime.now().isoformat()
        }
        f.write(json.dumps(interaction) + '\n')

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors by returning to the main page"""
    return render_template('index.html'), 200

@app.route('/health')
def health_check():
    """Simple health check endpoint to verify server is running"""
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()}), 200

@app.route('/upload-test')
def upload_test_page():
    """Render a simple test page to verify upload functionality"""
    upload_dirs = {
        'UPLOAD_FOLDER': {
            'path': app.config['UPLOAD_FOLDER'],
            'exists': os.path.exists(app.config['UPLOAD_FOLDER']),
            'writable': os.access(app.config['UPLOAD_FOLDER'], os.W_OK) if os.path.exists(app.config['UPLOAD_FOLDER']) else False
        },
        'STATIC_UPLOADS': {
            'path': os.path.join(os.path.dirname(os.path.abspath(__file__)), STATIC_UPLOAD_PATH),
            'exists': os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), STATIC_UPLOAD_PATH)),
            'writable': os.access(os.path.join(os.path.dirname(os.path.abspath(__file__)), STATIC_UPLOAD_PATH), os.W_OK) 
                      if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), STATIC_UPLOAD_PATH)) else False
        }
    }
    
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Upload Test</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
            .success { background-color: #d4edda; color: #155724; }
            .error { background-color: #f8d7da; color: #721c24; }
            .form-group { margin-bottom: 15px; }
            .btn { padding: 10px 15px; background-color: #007bff; color: white; border: none; cursor: pointer; }
            table { width: 100%; border-collapse: collapse; }
            table, th, td { border: 1px solid #ddd; }
            th, td { padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Upload Test Page</h1>
            
            <h2>Directory Status</h2>
            <table>
                <tr>
                    <th>Directory</th>
                    <th>Path</th>
                    <th>Exists</th>
                    <th>Writable</th>
                </tr>
    """
    
    for dir_name, dir_info in upload_dirs.items():
        exists_class = "success" if dir_info['exists'] else "error"
        writable_class = "success" if dir_info['writable'] else "error"
        
        html += f"""
        <tr>
            <td>{dir_name}</td>
            <td>{dir_info['path']}</td>
            <td class="{exists_class}">{"Yes" if dir_info['exists'] else "No"}</td>
            <td class="{writable_class}">{"Yes" if dir_info['writable'] else "No"}</td>
        </tr>
        """
    
    html += """
            </table>
            
            <h2>Upload Test</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="file">Select a file:</label>
                    <input type="file" id="file" name="file">
                </div>
                <button type="submit" class="btn">Upload</button>
            </form>
            
            <div id="result"></div>
            
            <script>
                document.querySelector('form').addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(this);
                    const resultDiv = document.getElementById('result');
                    
                    fetch('/upload', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            resultDiv.innerHTML = `<div class="status error">
                                <h3>Error</h3>
                                <p>${data.error}</p>
                            </div>`;
                        } else {
                            resultDiv.innerHTML = `<div class="status success">
                                <h3>Upload Successful</h3>
                                <p>File: ${data.original_filename}</p>
                                <p>Size: ${formatFileSize(data.size)}</p>
                                <p>URL: <a href="${data.url}" target="_blank">${data.url}</a></p>
                            </div>`;
                        }
                    })
                    .catch(error => {
                        resultDiv.innerHTML = `<div class="status error">
                            <h3>Request Failed</h3>
                            <p>${error}</p>
                        </div>`;
                    });
                });
                
                function formatFileSize(bytes) {
                    if (bytes < 1024) return bytes + ' bytes';
                    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                    else return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                }
            </script>
        </div>
    </body>
    </html>
    """
    
    return html

if __name__ == '__main__':
    if not API_KEY:
        print("Warning: OPENAI_API_KEY environment variable not set")
        print("Please set your OpenAI API key in the .env file")
    
    # Try to run the app on port 5001 or find another available port
    port = 5001
    max_port_attempts = 10
    
    for attempt in range(max_port_attempts):
        try:
            print(f"Trying to start server on port {port}...")
            # Bind to 0.0.0.0 instead of the default 127.0.0.1 to allow external connections
            # Increased threaded workers and improved timeout settings
            app.run(
                debug=True, 
                port=port, 
                host='0.0.0.0',
                threaded=True,
                use_reloader=True,
                use_debugger=True
            )
            break  # If successful, break out of the loop
        except OSError as e:
            if "Address already in use" in str(e) and attempt < max_port_attempts - 1:
                print(f"Port {port} is already in use, trying port {port + 1}")
                port += 1
            else:
                print(f"Error starting the server: {e}")
                # If we've tried all ports or got a different error, raise the exception
                raise
