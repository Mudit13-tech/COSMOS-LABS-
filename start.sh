#!/usr/bin/env bash
# Render start script — must cd into backend/ where cosmoslab package lives
set -o errexit
cd backend
exec gunicorn cosmoslab.wsgi:application --timeout 120 --workers 2
