"""
Management command: auto_mark_absent

Marks all employees without a check-in record as Absent for today (or a given date).
Run via cron: 0 23 * * 1-6 python manage.py auto_mark_absent

Usage:
    python manage.py auto_mark_absent
    python manage.py auto_mark_absent --date 2026-03-20
"""
import datetime
from django.core.management.base import BaseCommand
from apps.attendance.models import AttendanceLog, is_working_day
from apps.employees.models import Employee


class Command(BaseCommand):
    help = 'Auto-mark absent for employees with no check-in (Mon–Sat only)'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='Date in YYYY-MM-DD format (default: today)')

    def handle(self, *args, **options):
        date_str = options.get('date')
        if date_str:
            try:
                target_date = datetime.date.fromisoformat(date_str)
            except ValueError:
                self.stderr.write(f'Invalid date: {date_str}')
                return
        else:
            target_date = datetime.date.today()

        if not is_working_day(target_date):
            self.stdout.write(f'{target_date} is not a working day (Sunday). Skipping.')
            return

        employees    = Employee.objects.all()
        existing_ids = set(
            AttendanceLog.objects.filter(date=target_date)
            .values_list('employee_id', flat=True)
        )

        count = 0
        for emp in employees:
            if emp.id not in existing_ids:
                AttendanceLog.objects.create(
                    employee=emp,
                    date=target_date,
                    status=AttendanceLog.Status.ABSENT,
                    notes='Auto-marked absent by system',
                )
                count += 1

        self.stdout.write(
            self.style.SUCCESS(f'[{target_date}] Marked {count} employee(s) as absent.')
        )
