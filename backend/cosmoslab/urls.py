"""
URL configuration for cosmoslab project.
Serves both the API and the frontend HTML pages.
"""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.http import FileResponse
import os


def serve_file(subdir, filename):
    """Serve a static file from the project root."""
    def view(request):
        filepath = os.path.join(settings.PROJECT_ROOT, subdir, filename)
        if os.path.exists(filepath):
            content_types = {
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.otf': 'font/otf',
                '.ttf': 'font/ttf',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
            }
            ext = os.path.splitext(filename)[1].lower()
            ct = content_types.get(ext, 'application/octet-stream')
            return FileResponse(open(filepath, 'rb'), content_type=ct)
        from django.http import HttpResponseNotFound
        return HttpResponseNotFound(f'File not found: {subdir}/{filename}')
    return view


def serve_directory(request, subdir, filename):
    """Serve any file from a subdirectory of the project root."""
    filepath = os.path.join(settings.PROJECT_ROOT, subdir, filename)
    if os.path.exists(filepath):
        content_types = {
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.otf': 'font/otf',
            '.ttf': 'font/ttf',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.json': 'application/json',
            '.map': 'application/json',
        }
        ext = os.path.splitext(filename)[1].lower()
        ct = content_types.get(ext, 'application/octet-stream')
        return FileResponse(open(filepath, 'rb'), content_type=ct)
    from django.http import HttpResponseNotFound
    return HttpResponseNotFound(f'File not found: {subdir}/{filename}')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),

    # Serve frontend static files from project root directories
    path('css/<path:filename>', lambda r, filename: serve_directory(r, 'css', filename)),
    path('js/<path:filename>', lambda r, filename: serve_directory(r, 'js', filename)),
    path('assets/<path:filename>', lambda r, filename: serve_directory(r, 'assets', filename)),

    # Serve HTML pages
    path('dashboard.html', TemplateView.as_view(template_name='dashboard.html', content_type='text/html')),
    path('', TemplateView.as_view(template_name='index.html', content_type='text/html')),
]
