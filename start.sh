#!/usr/bin/env bash
# Render start script — gunicorn.conf.py sets chdir=backend/ internally
set -o errexit
exec gunicorn cosmoslab.wsgi:application --config gunicorn.conf.py
