"""API URL routing."""
from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/google/', views.google_login_view, name='google_login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/me/', views.me, name='me'),

    # Plan
    path('plan/', views.get_plan, name='get_plan'),
    path('plan/generate/', views.generate_plan, name='generate_plan'),
    path('plan/reset/', views.reset_plan, name='reset_plan'),

    # Progress
    path('progress/', views.get_progress, name='get_progress'),
    path('progress/complete-task/', views.complete_task, name='complete_task'),
    path('progress/toggle-task/', views.toggle_task, name='toggle_task'),
    path('progress/reset/', views.reset_progress, name='reset_progress'),
]
