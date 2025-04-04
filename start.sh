#!/bin/bash

echo "Checking if port 5000 is in use..."
pid=$(lsof -t -i:5000 2>/dev/null)

if [ -n "$pid" ]; then
  echo "Port 5000 is being used by process $pid. Attempting to terminate..."
  kill $pid
  sleep 1
  
  # Check if process was terminated successfully
  if lsof -t -i:5000 &>/dev/null; then
    echo "Warning: Process $pid is still running. Will try a different port."
    python app.py --port 5001
  else
    echo "Process terminated successfully. Starting Flask app on default port."
    python app.py
  fi
else
  echo "Port 5000 is available. Starting Flask app."
  python app.py
fi
