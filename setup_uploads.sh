#!/bin/bash

echo "Setting up upload directories..."

# Create uploads directory if it doesn't exist
if [ ! -d "uploads" ]; then
    mkdir uploads
    echo "Created uploads directory."
fi

# Create static/uploads directory if it doesn't exist
if [ ! -d "static/uploads" ]; then
    mkdir -p static/uploads
    echo "Created static/uploads directory."
fi

# Create symbolic link if it doesn't exist
if [ ! -L "static/uploads" ]; then
    # Remove directory if it exists but is not a symlink
    if [ -d "static/uploads" ]; then
        rm -rf static/uploads
    fi
    
    # Create the symbolic link
    ln -s "$(pwd)/uploads" "$(pwd)/static/uploads"
    echo "Created symbolic link from uploads to static/uploads."
fi

echo "Setup complete!"
chmod +x setup_uploads.sh
