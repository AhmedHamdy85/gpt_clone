#!/usr/bin/env python3
"""
Simple utility to check available OpenAI models for your API key
"""
import os
import requests
from dotenv import load_dotenv
import json
from datetime import datetime

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    print("Error: OPENAI_API_KEY not found. Create a .env file with your API key.")
    exit(1)

# Models we're allowed to use
ALLOWED_MODELS = ["gpt-4o-mini", "o1-mini", "dall-e-2"]

def check_available_models():
    """Check which models are available with your API key"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(
            "https://api.openai.com/v1/models",
            headers=headers
        )
        
        if response.status_code == 200:
            models = response.json()["data"]
            
            # Filter and sort by created date (newest first)
            models.sort(key=lambda x: x["created"], reverse=True)
            
            allowed_available = []
            not_available = []
            
            print("\n=== AVAILABLE MODELS ===\n")
            
            # Check which of our allowed models are available
            for allowed_model in ALLOWED_MODELS:
                available = any(model["id"] == allowed_model for model in models)
                if available:
                    allowed_available.append(allowed_model)
                else:
                    not_available.append(allowed_model)
            
            # Print available models
            print("Available allowed models:")
            if allowed_available:
                for model_id in allowed_available:
                    print(f"• {model_id}")
            else:
                print("None of the models we need are available with your API key.")
            
            # Print unavailable models
            if not_available:
                print("\nUnavailable models:")
                for model_id in not_available:
                    print(f"• {model_id} (not available with your API key)")
            
            if not_available:
                print("\nThere might be an issue with your API key's model access.")
                print("Please check your OpenAI account to ensure you have access to the required models.")
            
        else:
            print(f"Error checking models: {response.status_code}")
            print(response.text)
    
    except Exception as e:
        print(f"Error checking models: {e}")

def test_specific_model(model_name):
    """Test if a specific model is working"""
    print(f"\nTesting {model_name} access...")
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    test_payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": "Please respond with 'Hello world!'"
            }
        ],
        "max_tokens": 10
    }
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=test_payload
        )
        
        if response.status_code == 200:
            print(f"✅ {model_name} test successful!")
            return True
        else:
            print(f"❌ {model_name} test failed with status {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"❌ Error testing {model_name}: {e}")
        return False

if __name__ == "__main__":
    print(f"Checking models available with API key: {API_KEY[:5]}...{API_KEY[-4:]}")
    check_available_models()
    
    print("\n=== TESTING ALLOWED MODELS ===")
    for model in ["gpt-4o-mini", "o1-mini"]:
        test_specific_model(model)
