#!/usr/bin/env bash
# Render start script — gunicorn.conf.py sets chdir=backend/ internally
set -o errexit

# Run migrations before starting the server (safety net)
cd backend
python manage.py migrate --no-input
cd ..

exec gunicorn cosmoslab.wsgi:application --config gunicorn.conf.py
