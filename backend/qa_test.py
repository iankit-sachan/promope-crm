"""QA Backend API Test Script"""
import requests, json, datetime, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

BASE = 'http://127.0.0.1:8000/api'

def login(email):
    r = requests.post(f'{BASE}/auth/login/', json={'email': email, 'password': 'Test@1234'})
    if r.status_code == 200:
        return r.json().get('access') or r.json().get('tokens', {}).get('access')
    return None

emp_tok = login('rahul@company.com')
mgr_tok = login('founder@company.com')
emp_h = {'Authorization': f'Bearer {emp_tok}'}
mgr_h = {'Authorization': f'Bearer {mgr_tok}'}
today = datetime.date.today().isoformat()

results = {}

print('='*60)
print('PHASE 2: DAILY REPORT + ACTIVITY + DASHBOARD TESTS')
print('='*60)

# 2.2a Create daily report
print('\n--- 2.2a: POST /tracking/reports/ (create draft) ---')
r = requests.post(f'{BASE}/tracking/reports/', json={
    'report_date': today,
    'tasks_assigned': 5,
    'tasks_completed': 3,
    'tasks_pending': 2,
    'hours_worked': '7.5',
    'work_description': 'QA tested the time tracking module. Fixed task.name bug.',
    'blockers': 'None at this time',
    'plan_for_tomorrow': 'Continue QA testing frontend pages.',
}, headers=emp_h)
print(f'Status: {r.status_code}')
if r.ok:
    d = r.json()
    report_id = d['id']
    print(f'  id={report_id} status={d["status"]} date={d["report_date"]} completion_rate={d.get("completion_rate")}%')
    results['create_report'] = 'PASS'
else:
    print(f'  FAIL: {r.text[:400]}')
    report_id = None
    results['create_report'] = 'FAIL'

# 2.2b Upsert same date
print('\n--- 2.2b: POST /tracking/reports/ (upsert same date) ---')
r = requests.post(f'{BASE}/tracking/reports/', json={
    'report_date': today,
    'tasks_assigned': 6,
    'tasks_completed': 4,
    'tasks_pending': 2,
    'hours_worked': '8.0',
    'work_description': 'Updated via upsert mechanism.',
}, headers=emp_h)
print(f'Status: {r.status_code}')
if r.ok:
    d = r.json()
    tasks_assigned = d.get('tasks_assigned')
    print(f'  tasks_assigned={tasks_assigned} (expected 6) -> upsert {"worked" if tasks_assigned == 6 else "FAILED"}')
    results['upsert_report'] = 'PASS' if tasks_assigned == 6 else 'PARTIAL'
else:
    print(f'  Response: {r.text[:200]}')
    results['upsert_report'] = 'DUPLICATE_OK (400)' if r.status_code == 400 else 'FAIL'

# 2.2c Submit report
if report_id:
    print(f'\n--- 2.2c: PATCH /tracking/reports/{report_id}/ (submit) ---')
    r = requests.patch(f'{BASE}/tracking/reports/{report_id}/', json={'status': 'submitted'}, headers=emp_h)
    print(f'Status: {r.status_code}')
    if r.ok:
        status_val = r.json().get('status')
        print(f'  status={status_val} (expected: submitted)')
        results['submit_report'] = 'PASS' if status_val == 'submitted' else 'PARTIAL'
    else:
        print(f'  FAIL: {r.text[:300]}')
        results['submit_report'] = 'FAIL'

    # 2.2d Review report
    print(f'\n--- 2.2d: POST /tracking/reports/{report_id}/review/ ---')
    r = requests.post(f'{BASE}/tracking/reports/{report_id}/review/', json={
        'action': 'approve', 'comment': 'QA approved - looks good'
    }, headers=mgr_h)
    print(f'Status: {r.status_code}')
    if r.ok:
        d = r.json()
        print(f'  status={d.get("status")} reviewed_by={d.get("reviewed_by_name")} comment={d.get("review_comment")}')
        results['review_report'] = 'PASS'
    else:
        print(f'  FAIL: {r.text[:400]}')
        results['review_report'] = 'FAIL'

# 2.2e Reject report test
print('\n--- 2.2e: POST /tracking/reports/ (new report) + reject ---')
import datetime as dt
yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
r = requests.post(f'{BASE}/tracking/reports/', json={
    'report_date': yesterday,
    'tasks_assigned': 3,
    'tasks_completed': 1,
    'hours_worked': '4.0',
    'work_description': 'Partial work day',
}, headers=emp_h)
if r.ok:
    r2id = r.json()['id']
    # Submit it
    requests.patch(f'{BASE}/tracking/reports/{r2id}/', json={'status': 'submitted'}, headers=emp_h)
    # Reject
    r_rej = requests.post(f'{BASE}/tracking/reports/{r2id}/review/', json={
        'action': 'reject', 'comment': 'Missing work details'
    }, headers=mgr_h)
    print(f'Reject status: {r_rej.status_code}  report_status={r_rej.json().get("status") if r_rej.ok else "FAIL"}')
    results['reject_report'] = 'PASS' if r_rej.ok and r_rej.json().get('status') == 'rejected' else 'FAIL'

# 2.2f Report summary
print('\n--- 2.2f: GET /tracking/reports/summary/ ---')
r = requests.get(f'{BASE}/tracking/reports/summary/', headers=mgr_h)
print(f'Status: {r.status_code}')
if r.ok:
    d = r.json()
    print(f'  total={d.get("total_reports")} submitted_today={d.get("submitted_today")} pending={d.get("pending_review")}')
    print(f'  by_status={d.get("by_status")}')
    results['report_summary'] = 'PASS'
else:
    print(f'  FAIL: {r.text[:300]}')
    results['report_summary'] = 'FAIL'

# 2.3a Activity List
print('\n--- 2.3a: GET /activity/?verb=timer_started ---')
r = requests.get(f'{BASE}/activity/', params={'verb': 'timer_started'}, headers=emp_h)
print(f'Status: {r.status_code}')
if r.ok:
    raw = r.json()
    logs = raw if isinstance(raw, list) else raw.get('results', [])
    total = raw.get('count', len(logs)) if not isinstance(raw, list) else len(raw)
    print(f'  total timer_started events: {total}')
    if logs:
        l = logs[0]
        print(f'  latest: {l.get("verb")} by {l.get("actor", {}).get("full_name")} - {l.get("description")}')
    results['activity_list'] = 'PASS'
else:
    print(f'  FAIL: {r.text[:300]}')
    results['activity_list'] = 'FAIL'

# 2.3b Log page visit
print('\n--- 2.3b: POST /activity/log-visit/ ---')
r = requests.post(f'{BASE}/activity/log-visit/', json={'page': '/time-tracking', 'page_title': 'Time Tracking'}, headers=emp_h)
print(f'Status: {r.status_code}  (expected 200 or 201)  body={r.text[:100]}')
results['log_page_visit'] = 'PASS' if r.status_code in (200, 201) else 'FAIL'

# 2.3c Activity verb filter test
print('\n--- 2.3c: GET /activity/?verb=daily_report_submitted ---')
r = requests.get(f'{BASE}/activity/', params={'verb': 'daily_report_submitted'}, headers=mgr_h)
print(f'Status: {r.status_code}')
if r.ok:
    raw = r.json()
    count = raw.get('count', len(raw)) if not isinstance(raw, list) else len(raw)
    print(f'  daily_report_submitted events: {count}')
    results['activity_verb_filter'] = 'PASS'
else:
    results['activity_verb_filter'] = 'FAIL'

# 2.4a Productivity dashboard
print('\n--- 2.4a: GET /tracking/productivity/ ---')
r = requests.get(f'{BASE}/tracking/productivity/', headers=mgr_h)
print(f'Status: {r.status_code}')
if r.ok:
    d = r.json()
    rows = d.get('employees', [])
    print(f'  employees: {len(rows)}  total: {d.get("total_employees")}')
    if rows:
        row = rows[0]
        print(f'  top: {row.get("employee_name")} completion={row.get("completion_rate")}% hours={row.get("total_hours")} timer_min={row.get("total_timer_minutes")}')
    results['productivity'] = 'PASS'
else:
    print(f'  FAIL: {r.text[:300]}')
    results['productivity'] = 'FAIL'

# 2.4b Online users
print('\n--- 2.4b: GET /tracking/online-users/ ---')
r = requests.get(f'{BASE}/tracking/online-users/', headers=mgr_h)
print(f'Status: {r.status_code}')
if r.ok:
    d = r.json()
    print(f'  online_count={d.get("online_count")} away_count={d.get("away_count")} users={len(d.get("users", []))}')
    results['online_users'] = 'PASS'
else:
    print(f'  FAIL: {r.text[:300]}')
    results['online_users'] = 'FAIL'

# 2.5 Employee access control
print('\n--- 2.5: Employee cannot access productivity/online-users ---')
r1 = requests.get(f'{BASE}/tracking/productivity/', headers=emp_h)
r2 = requests.get(f'{BASE}/tracking/online-users/', headers=emp_h)
print(f'  /productivity/ as employee: {r1.status_code} (expected 403)')
print(f'  /online-users/ as employee: {r2.status_code} (expected 403)')
results['access_control'] = 'PASS' if r1.status_code == 403 and r2.status_code == 403 else 'FAIL'

# Final timer summary to confirm all data
print('\n--- 2.6: Final timer summary ---')
r = requests.get(f'{BASE}/tracking/timers/summary/', params={'date_from': today, 'date_to': today}, headers=emp_h)
if r.ok:
    d = r.json()
    print(f'  active_timer: {d.get("active_timer")}')
    for s in d.get('summary', []):
        print(f'  task={s.get("task__name")} total_minutes={s.get("total_minutes")} sessions={s.get("sessions")}')
    results['timer_summary_final'] = 'PASS'

print()
print('='*60)
print('ALL API RESULTS:')
for k, v in sorted(results.items()):
    icon = 'PASS' if v == 'PASS' else ('WARN' if 'PARTIAL' in str(v) or 'GRACEFUL' in str(v) or 'OK' in str(v) else 'FAIL')
    print(f'  [{icon}] {k}: {v}')
print('='*60)
