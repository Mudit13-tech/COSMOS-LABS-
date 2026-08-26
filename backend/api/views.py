"""
API views for Cosmos Lab.
Handles authentication, plan generation (with Groq), and progress tracking.
"""
import json
import re
import time
import traceback

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.conf import settings

from .models import Plan, Phase, Day, Task, Progress

try:
    from groq import Groq
except ImportError:
    Groq = None


# ---- Helper ---------------------------------------------------------------

def json_body(request):
    """Parse JSON from request body."""
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return {}


def require_auth(view_func):
    """Decorator that returns 401 if the user is not authenticated."""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


# ---- Auth -----------------------------------------------------------------

@csrf_exempt
@require_http_methods(["POST"])
def register(request):
    """Create a new user account."""
    data = json_body(request)
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not re.match(r'^\S+@\S+\.\S+$', email):
        return JsonResponse({'error': 'Enter a valid email address.'}, status=400)
    if not password or len(password) < 8:
        return JsonResponse({'error': 'Password must be at least 8 characters.'}, status=400)

    if User.objects.filter(username=email).exists():
        return JsonResponse({'error': 'An account already exists for that email. Try logging in instead.'}, status=400)

    user = User.objects.create_user(username=email, email=email, password=password)
    login(request, user)
    return JsonResponse({
        'user': {
            'id': getattr(user, 'id', None),
            'email': getattr(user, 'email', email),
            'name': email.split('@')[0],
        }
    })


@csrf_exempt
@require_http_methods(["POST"])
def login_view(request):
    """Log in with email and password."""
    data = json_body(request)
    email = data.get('email', '').strip()
    password = data.get('password', '')

    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({'error': 'Identification or passcode not recognized.'}, status=401)

    login(request, user)
    return JsonResponse({
        'user': {
            'id': getattr(user, 'id', None),
            'email': getattr(user, 'email', email),
            'name': getattr(user, 'first_name', '') or (getattr(user, 'email', None) or email or '').split('@')[0],
        }
    })



@csrf_exempt
@require_http_methods(["POST"])
def logout_view(request):
    """Log out the current user."""
    logout(request)
    return JsonResponse({'ok': True})


@require_http_methods(["GET"])
def me(request):
    """Return the current authenticated user, or null."""
    if request.user.is_authenticated:
        return JsonResponse({
            'user': {
                'id': request.user.id,
                'email': request.user.email,
                'name': request.user.first_name or request.user.email.split('@')[0],
            }
        })
    return JsonResponse({'user': None})


# ---- Plan -----------------------------------------------------------------

@require_http_methods(["GET"])
@require_auth
def get_plan(request):
    """Get the user's active plan."""
    plan = Plan.objects.filter(user=request.user, is_active=True).first()
    if not plan:
        return JsonResponse({'plan': None})
    return JsonResponse({'plan': plan.to_dict()})


PLANET_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']

GEMINI_PROMPT = """You are a master technical planner and architect. The user ({name}) wants to learn or build: "{topic}".
They have specified the following duration/timeline for this goal: "{duration}".
Create a detailed, day-by-day curriculum or roadmap divided into exactly 8 phases, tailored to the requested duration.
The phases must map to these 8 planets in order: mercury, venus, earth, mars, jupiter, saturn, uranus, neptune.
Each phase should have a title, a short summary, and an array of days.
Each day should have a list of tasks.
For each task, you MUST include a "resourceLinks" array with required documents, articles, or YouTube links (full URLs) for that day's work if available.
Return ONLY valid JSON matching this schema:
{{
  "topic": "String",
  "status": "confirmed",
  "phases": [
    {{
      "phaseIndex": 0,
      "planet": "mercury",
      "title": "String",
      "summary": "String",
      "days": [
        {{
          "dayIndex": 1,
          "tasks": [
            {{
              "id": "t1-1",
              "title": "String",
              "tags": ["String"],
              "estMinutes": Number,
              "description": "String",
              "resourceLinks": ["String (URL)"]
            }}
          ]
        }}
      ]
    }}
  ]
}}
IMPORTANT: dayIndex must be globally unique across all phases (i.e. phase 1 starts at day 1, phase 2 continues from where phase 1 left off, etc.).
Return ONLY valid JSON. Make the roadmap comprehensive and realistic, with multiple days per phase as appropriate."""


@csrf_exempt
@require_http_methods(["POST"])
@require_auth
def generate_plan(request):
    """Generate a new plan using Groq AI, save to DB, and return it."""
    try:
        data = json_body(request)
        topic = data.get('topic', '').strip()
        name = data.get('name', '').strip() or "the user"
        duration = data.get('duration', '').strip() or "at their own pace"

        if not topic:
            return JsonResponse({'error': 'Please provide a topic.'}, status=400)

        if not getattr(settings, 'GROQ_API_KEY', None):
            return JsonResponse({'error': 'Groq API key not configured on the server.'}, status=500)
        if not Groq:
            return JsonResponse({'error': 'Groq library is not installed on the server.'}, status=500)

        prompt = GEMINI_PROMPT.format(topic=topic, name=name, duration=duration)

        plan_data = None
        last_error = None

        # --- Groq (sole AI provider) — try models in order until one works ---
        GROQ_MODELS = [
            "llama3-70b-8192",
            "llama-3.1-70b-versatile",
            "mixtral-8x7b-32768",
            "llama3-8b-8192",
        ]

        groq_client = Groq(api_key=settings.GROQ_API_KEY)
        for model_name in GROQ_MODELS:
            try:
                chat_completion = groq_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that ALWAYS outputs valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    model=model_name,
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )
                raw_text = chat_completion.choices[0].message.content or ""
                raw_text = re.sub(r'^```(json)?', '', raw_text).strip()
                raw_text = re.sub(r'```$', '', raw_text).strip()

                temp_plan = json.loads(raw_text)

                if temp_plan and isinstance(temp_plan.get('phases'), list) and len(temp_plan['phases']) > 0:
                    plan_data = temp_plan
                    break  # Success!
                else:
                    last_error = f'Groq ({model_name}) returned an invalid plan structure.'
            except json.JSONDecodeError as e:
                last_error = f'Groq ({model_name}) returned invalid JSON: {str(e)}'
                traceback.print_exc()
                break  # JSON issues won't be fixed by trying another model
            except Exception as e:
                err_str = str(e)
                last_error = f'Groq ({model_name}) failed: {err_str}'
                # Only skip to the next model on 404/model_not_found errors
                if '404' in err_str or 'model_not_found' in err_str or 'does not exist' in err_str:
                    traceback.print_exc()
                    continue
                traceback.print_exc()
                break  # Other errors (auth, quota, etc.) — no point retrying

        if not plan_data:
            return JsonResponse({'error': last_error or 'Groq AI failed to generate a plan.'}, status=500)

        # Deactivate any existing active plans for this user
        Plan.objects.filter(user=request.user, is_active=True).update(is_active=False)

        # Save the plan to the database
        plan = Plan.objects.create(
            user=request.user,
            topic=plan_data.get('topic', topic),
            status='confirmed',
        )

        global_day_counter = 1
        for phase_data in plan_data['phases']:
            phase_index = phase_data.get('phaseIndex', 0)
            planet = phase_data.get('planet', PLANET_ORDER[phase_index] if phase_index < len(PLANET_ORDER) else 'mercury')

            phase = Phase.objects.create(
                plan=plan,
                phase_index=phase_index,
                planet=planet.lower(),
                title=phase_data.get('title', f'Phase {phase_index + 1}'),
                summary=phase_data.get('summary', ''),
            )

            for day_data in phase_data.get('days', []):
                day_index = day_data.get('dayIndex', global_day_counter)
                day = Day.objects.create(
                    phase=phase,
                    day_index=day_index,
                )
                global_day_counter = day_index + 1

                for t_idx, t_data in enumerate(day_data.get('tasks', [])):
                    Task.objects.create(
                        day=day,
                        task_id=t_data.get('id', f't{phase_index}-{t_idx}'),
                        title=t_data.get('title', 'Untitled task'),
                        tags=t_data.get('tags', []),
                        est_minutes=t_data.get('estMinutes', 60),
                        description=t_data.get('description', ''),
                        resource_links=t_data.get('resourceLinks', []),
                        systems_init=t_data.get('systemsInit', ''),
                        observed=t_data.get('observed', False),
                    )

        # Create initial progress record
        num_phases = len(plan_data['phases'])
        Progress.objects.create(
            user=request.user,
            plan=plan,
            phase_unlocked=[i == 0 for i in range(num_phases)],
        )

        return JsonResponse({'plan': plan.to_dict()})
        
    except Exception as e:
        traceback.print_exc()
        return JsonResponse({
            'error': f'Uncaught Server Error: {str(e)}',
            'traceback': traceback.format_exc()
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@require_auth
def reset_plan(request):
    """Deactivate the current plan so the user can start a new mission."""
    Plan.objects.filter(user=request.user, is_active=True).update(is_active=False)
    return JsonResponse({'ok': True})


# ---- Progress --------------------------------------------------------------

@require_http_methods(["GET"])
@require_auth
def get_progress(request):
    """Get progress for the user's active plan."""
    plan = Plan.objects.filter(user=request.user, is_active=True).first()
    if not plan:
        return JsonResponse({'progress': None})

    progress, created = Progress.objects.get_or_create(
        user=request.user,
        plan=plan,
        defaults={
            'phase_unlocked': [i == 0 for i in range(plan.phases.count())],
        }
    )
    return JsonResponse({'progress': progress.to_dict()})


@csrf_exempt
@require_http_methods(["POST"])
@require_auth
def complete_task(request):
    """Mark a task as complete (or update its notes/hours)."""
    data = json_body(request)
    task_id = data.get('taskId')
    day_index = data.get('dayIndex')
    phase_index = data.get('phaseIndex', 0)
    note = data.get('note', '')
    logged_minutes = data.get('loggedMinutes', 0)

    if not task_id:
        return JsonResponse({'error': 'taskId is required'}, status=400)

    plan = Plan.objects.filter(user=request.user, is_active=True).first()
    if not plan:
        return JsonResponse({'error': 'No active plan'}, status=404)

    progress, _ = Progress.objects.get_or_create(
        user=request.user,
        plan=plan,
        defaults={
            'phase_unlocked': [i == 0 for i in range(plan.phases.count())],
        }
    )

    # Update completed tasks
    completed_tasks = dict(progress.completed_tasks)
    completed_tasks[task_id] = {
        'done': True,
        'note': note,
        'loggedMinutes': logged_minutes,
        'completedAt': int(time.time() * 1000),
    }
    progress.completed_tasks = completed_tasks

    # Check if the day is complete (all tasks in the day are done)
    day_key = f"{phase_index}_{day_index}"
    phase = plan.phases.filter(phase_index=phase_index).first()
    if phase:
        day_obj = phase.days.filter(day_index=day_index).first()
        if day_obj:
            all_done = all(
                t.task_id in completed_tasks
                for t in day_obj.tasks.all()
            )
            completed_days = dict(progress.completed_days)
            if all_done:
                completed_days[day_key] = True
            else:
                completed_days.pop(day_key, None)
            progress.completed_days = completed_days

            # Check if phase is complete
            all_days_done = all(
                f"{phase_index}_{d.day_index}" in completed_days
                for d in phase.days.all()
            )
            completed_phases = dict(progress.completed_phases)
            if all_days_done:
                completed_phases[str(phase_index)] = True
                # Unlock next phase
                phase_unlocked = list(progress.phase_unlocked)
                next_idx = phase_index + 1
                if next_idx < len(phase_unlocked):
                    phase_unlocked[next_idx] = True
                    progress.phase_unlocked = phase_unlocked
            progress.completed_phases = completed_phases

    # Recompute streak
    progress.current_streak = _compute_streak(progress.completed_days)
    progress.save()

    return JsonResponse({'progress': progress.to_dict()})


@csrf_exempt
@require_http_methods(["POST"])
@require_auth
def toggle_task(request):
    """Toggle a task's completion state."""
    data = json_body(request)
    task_id = data.get('taskId')
    day_index = data.get('dayIndex')
    phase_index = data.get('phaseIndex', 0)

    if not task_id:
        return JsonResponse({'error': 'taskId is required'}, status=400)

    plan = Plan.objects.filter(user=request.user, is_active=True).first()
    if not plan:
        return JsonResponse({'error': 'No active plan'}, status=404)

    progress, _ = Progress.objects.get_or_create(
        user=request.user,
        plan=plan,
        defaults={
            'phase_unlocked': [i == 0 for i in range(plan.phases.count())],
        }
    )

    completed_tasks = dict(progress.completed_tasks)
    if task_id in completed_tasks:
        del completed_tasks[task_id]
    else:
        completed_tasks[task_id] = {
            'done': True,
            'note': '',
            'loggedMinutes': 0,
            'completedAt': int(time.time() * 1000),
        }
    progress.completed_tasks = completed_tasks

    # Recompute day/phase completion
    day_key = f"{phase_index}_{day_index}"
    phase = plan.phases.filter(phase_index=phase_index).first()
    if phase:
        day_obj = phase.days.filter(day_index=day_index).first()
        if day_obj:
            all_done = all(t.task_id in completed_tasks for t in day_obj.tasks.all())
            completed_days = dict(progress.completed_days)
            if all_done:
                completed_days[day_key] = True
            else:
                completed_days.pop(day_key, None)
            progress.completed_days = completed_days

            all_days_done = all(
                f"{phase_index}_{d.day_index}" in completed_days
                for d in phase.days.all()
            )
            completed_phases = dict(progress.completed_phases)
            if all_days_done:
                completed_phases[str(phase_index)] = True
                phase_unlocked = list(progress.phase_unlocked)
                next_idx = phase_index + 1
                if next_idx < len(phase_unlocked):
                    phase_unlocked[next_idx] = True
                    progress.phase_unlocked = phase_unlocked
            else:
                completed_phases.pop(str(phase_index), None)
            progress.completed_phases = completed_phases

    progress.current_streak = _compute_streak(progress.completed_days)
    progress.save()

    return JsonResponse({'progress': progress.to_dict()})


@csrf_exempt
@require_http_methods(["POST"])
@require_auth
def reset_progress(request):
    """Reset all progress for the active plan."""
    plan = Plan.objects.filter(user=request.user, is_active=True).first()
    if not plan:
        return JsonResponse({'error': 'No active plan'}, status=404)

    progress = Progress.objects.filter(user=request.user, plan=plan).first()
    if progress:
        progress.current_phase_index = 0
        progress.current_day_index = 1
        progress.completed_tasks = {}
        progress.completed_days = {}
        progress.completed_phases = {}
        progress.phase_unlocked = [i == 0 for i in range(plan.phases.count())]
        progress.current_streak = 0
        progress.save()

    return JsonResponse({'progress': progress.to_dict() if progress else None})


def _compute_streak(completed_days):
    """Compute consecutive day streak from completed_days dict."""
    # Extract day indices from keys like "0_1", "0_2", etc.
    day_nums = []
    for key in completed_days:
        parts = key.split('_')
        if len(parts) == 2:
            try:
                day_nums.append(int(parts[1]))
            except ValueError:
                pass
        else:
            try:
                day_nums.append(int(key))
            except ValueError:
                pass

    if not day_nums:
        return 0

    day_nums = sorted(set(day_nums), reverse=True)
    streak = 1
    for i in range(len(day_nums) - 1):
        if day_nums[i] - day_nums[i + 1] == 1:
            streak += 1
        else:
            break
    return streak
