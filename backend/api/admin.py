# pyrefly: ignore [missing-import]
from django.contrib import admin
from .models import Plan, Phase, Day, Task, Progress

admin.site.register(Plan)
admin.site.register(Phase)
admin.site.register(Day)
admin.site.register(Task)
admin.site.register(Progress)
