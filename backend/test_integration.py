import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import django, os, requests
from datetime import date, timedelta
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

BASE  = 'http://127.0.0.1:8000/api'
TODAY = str(date.today())
RESULTS = []

def get_token(email, pw='Test@1234'):
    r = requests.post(f'{BASE}/auth/login/', json={'email': email, 'password': pw}, timeout=5)
    if r.status_code == 200:
        d = r.json()
        return d.get('access') or d.get('token')
    return None

def hdr(tok):
    return {'Authorization': f'Bearer {tok}'}

def record(tid, name, passed, detail=''):
    RESULTS.append((tid, name, passed, detail))
    st = 'PASS' if passed else 'FAIL'
    line = f'[{st}] {tid} - {name}'
    if detail:
        line += f' ({detail})'
    print(line)

tok_hr      = get_token('hr@company.com')
tok_founder = get_token('founder@company.com')
tok_emp1    = get_token('priya@company.com')

from apps.daily_reports.models import DailyReport
from apps.employees.models import Employee
from apps.authentication.models import User
from apps.notifications.models import Notification
from apps.activity.models import ActivityLog

# ── INTEG-1: Analytics match DB ────────────────────────────────────────────────
actual_submitted = DailyReport.objects.filter(
    report_date=TODAY, status__in=['submitted', 'reviewed']
).count()
r = requests.get(f'{BASE}/daily-reports/analytics/', headers=hdr(tok_hr))
if r.status_code == 200:
    a = r.json()
    record('INTEG-1', 'Analytics submitted_today matches DB',
           a['submitted_today'] == actual_submitted,
           f'API={a["submitted_today"]}, DB={actual_submitted}')
    record('INTEG-1a', 'total_hours_today is numeric',
           isinstance(a['total_hours_today'], (int, float)),
           f'value={a["total_hours_today"]}')
    record('INTEG-1b', 'hours_per_day <= 14 entries',
           len(a.get('hours_per_day', [])) <= 14,
           f'count={len(a.get("hours_per_day", []))}')

# ── INTEG-2: Notification on submission ────────────────────────────────────────
hr_user = User.objects.get(email='hr@company.com')
founder = User.objects.get(email='founder@company.com')
notifs_before_hr = Notification.objects.filter(recipient=hr_user, type='system').count()
notifs_before_fn = Notification.objects.filter(recipient=founder, type='system').count()

emp3 = Employee.objects.filter(status='active').exclude(
    employee_daily_reports__report_date=TODAY
).first()
if emp3:
    DailyReport.objects.filter(employee=emp3, report_date=TODAY).delete()
    tok3 = get_token(emp3.user.email)
    if not tok3:
        emp3.user.set_password('Test@1234')
        emp3.user.save()
        tok3 = get_token(emp3.user.email)
    if tok3:
        r = requests.post(f'{BASE}/daily-reports/', json={
            'report_date': TODAY,
            'tasks_assigned': 'Integration test task',
            'tasks_completed': 'Test done',
            'tasks_pending': '',
            'hours_worked': '8',
            'work_description': 'Integration test work',
            'blockers': '',
        }, headers=hdr(tok3))
        if r.status_code == 201:
            new_rid = r.json().get('id')
            r2 = requests.post(f'{BASE}/daily-reports/{new_rid}/submit/', headers=hdr(tok3))
            if r2.status_code == 200:
                notifs_after_hr = Notification.objects.filter(recipient=hr_user, type='system').count()
                notifs_after_fn = Notification.objects.filter(recipient=founder, type='system').count()
                record('INTEG-2', 'Notification created for HR on submit',
                       notifs_after_hr > notifs_before_hr,
                       f'before={notifs_before_hr}, after={notifs_after_hr}')
                record('INTEG-2a', 'Notification created for Founder on submit',
                       notifs_after_fn > notifs_before_fn,
                       f'before={notifs_before_fn}, after={notifs_after_fn}')
            else:
                record('INTEG-2', 'Notification created for HR on submit', False,
                       f'submit failed HTTP {r2.status_code}')
        else:
            record('INTEG-2', 'Notification created for HR on submit', False,
                   f'create failed HTTP {r.status_code}')

# ── INTEG-3: ActivityLog on submission ─────────────────────────────────────────
recent_logs = ActivityLog.objects.filter(verb='daily_report_submitted').order_by('-created_at')
record('INTEG-3', 'ActivityLog entries for daily_report_submitted',
       recent_logs.exists(), f'count={recent_logs.count()}')
if recent_logs.exists():
    record('INTEG-3a', 'target_type = daily_report',
           recent_logs.first().target_type == 'daily_report',
           f'target_type={recent_logs.first().target_type}')

# ── INTEG-4: ActivityLog on review ─────────────────────────────────────────────
review_logs = ActivityLog.objects.filter(verb='daily_report_reviewed')
record('INTEG-4', 'ActivityLog entries for daily_report_reviewed',
       review_logs.exists(), f'count={review_logs.count()}')

# ── INTEG-5: my-reports matches DB count ───────────────────────────────────────
emp1 = Employee.objects.get(employee_id='EMP-0002')
emp1_db_count = DailyReport.objects.filter(employee=emp1).count()
r = requests.get(f'{BASE}/daily-reports/my-reports/', headers=hdr(tok_emp1))
if r.status_code == 200:
    d = r.json()
    items = d if isinstance(d, list) else d.get('results', [])
    record('INTEG-5', 'my-reports API count matches DB',
           len(items) == emp1_db_count,
           f'API={len(items)}, DB={emp1_db_count}')

# ── INTEG-6: submitted + not_submitted = total active ──────────────────────────
r = requests.get(f'{BASE}/daily-reports/analytics/', headers=hdr(tok_hr))
if r.status_code == 200:
    a = r.json()
    total_active = Employee.objects.filter(status='active').count()
    api_total = a['submitted_today'] + a['not_submitted_today']
    record('INTEG-6', 'submitted + not_submitted = total active',
           api_total == total_active,
           f'submitted={a["submitted_today"]}, not_sub={a["not_submitted_today"]}, active={total_active}')

# ── INTEG-7: Date range filter ─────────────────────────────────────────────────
date_from = str(date.today() - timedelta(days=7))
r = requests.get(f'{BASE}/daily-reports/all/?date_from={date_from}&date_to={TODAY}',
                 headers=hdr(tok_hr))
record('INTEG-7', 'Date range filter /all/', r.status_code == 200, f'HTTP {r.status_code}')
if r.status_code == 200:
    d = r.json()
    items = d if isinstance(d, list) else d.get('results', [])
    all_in_range = all(date_from <= i['report_date'] <= TODAY for i in items)
    record('INTEG-7a', 'All results within date range', all_in_range, f'count={len(items)}')

# ── INTEG-8: GET /daily-reports/<pk>/ returns full detail ──────────────────────
rep1 = DailyReport.objects.filter(employee=emp1).first()
if rep1:
    r = requests.get(f'{BASE}/daily-reports/{rep1.id}/', headers=hdr(tok_emp1))
    record('INTEG-8', 'GET /daily-reports/<pk>/ returns 200', r.status_code == 200, f'HTTP {r.status_code}')
    if r.status_code == 200:
        b = r.json()
        for field in ['id', 'report_date', 'status', 'work_description', 'hours_worked']:
            record('INTEG-8', f'Detail has field: {field}', field in b, f'val={b.get(field)}')

print()
p = sum(1 for _, _, ok, _ in RESULTS if ok)
f = sum(1 for _, _, ok, _ in RESULTS if not ok)
print(f'Integration Tests: {p} PASSED, {f} FAILED out of {len(RESULTS)}')
print()

# Store global results for final report
import json
with open('/tmp/integ_results.json', 'w') as fp:
    json.dump(RESULTS, fp)
