#!/bin/bash

echo "Fixing permissions for upload directories..."

# Define directories
UPLOADS_DIR="uploads"
STATIC_UPLOADS_DIR="static/uploads"

# Ensure directories exist
mkdir -p $UPLOADS_DIR
mkdir -p $STATIC_UPLOADS_DIR

# Set permissions (adjust as needed for your environment)
chmod -R 755 $UPLOADS_DIR
chmod -R 755 $STATIC_UPLOADS_DIR

# If running in a web server environment, you might need to set the owner
# Uncomment and modify as needed for your environment
# chown -R www-data:www-data $UPLOADS_DIR
# chown -R www-data:www-data $STATIC_UPLOADS_DIR

echo "Creating test file to verify write permissions"
TEST_FILE="$UPLOADS_DIR/test_permission.txt"
echo "This is a test file" > $TEST_FILE

if [ -f "$TEST_FILE" ]; then
  echo "✅ Successfully created test file. Write permissions are working."
  rm $TEST_FILE
else
  echo "❌ Could not create test file. Please check permissions manually."
fi

echo "Done setting permissions."
echo "You may need to run this script with sudo if you don't have sufficient permissions."
