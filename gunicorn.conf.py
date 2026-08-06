"""
Gunicorn configuration for Render deployment.
Sets the working directory to backend/ so cosmoslab package is importable.
"""
import os

# Change working directory to backend/ where the cosmoslab Django package lives
chdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')

# Workers
workers = 2
timeout = 120
