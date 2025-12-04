#!/bin/bash
set -e

# Change directory to the repository root
cd "$(dirname "$0")/.."

# Create a virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate the virtual environment
source venv/bin/activate

# Install required packages
echo "Installing requirements..."
pip install -r requirements.txt

echo "Virtual environment setup complete."
