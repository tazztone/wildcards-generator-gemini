import os
import sys

# Ensure the root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from python_app.app import demo

if __name__ == "__main__":
    demo.launch(css_paths=["web/wildcards.css"])
