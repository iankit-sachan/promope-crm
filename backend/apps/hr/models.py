"""
HR module models:
  - LeaveRequest   — employee leave submissions with HR approval workflow
  - LeaveBalance   — annual leave quota per employee per type
  - HRDocument     — employee documents (ID, contracts, certificates)
  - RecruitmentPosition — open job positions
  - Applicant      — applicants linked to positions
"""

from decimal import Decimal

from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


# ── Leave ─────────────────────────────────────────────────────────────────────

class LeaveRequest(models.Model):
    class LeaveType(models.TextChoices):
        SICK      = 'sick',      'Sick Leave'
        CASUAL    = 'casual',    'Casual Leave'
        PAID      = 'paid',      'Paid Leave'
        EMERGENCY = 'emergency', 'Emergency Leave'

    class Status(models.TextChoices):
        PENDING   = 'pending',   'Pending'
        APPROVED  = 'approved',  'Approved'
        REJECTED  = 'rejected',  'Rejected'
        CANCELLED = 'cancelled', 'Cancelled'

    employee       = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='leave_requests',
    )
    leave_type     = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date     = models.DateField()
    end_date       = models.DateField()
    reason         = models.TextField()
    status         = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    reviewed_by    = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_leaves',
    )
    review_comment = models.TextField(blank=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'leave_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.employee.full_name} — {self.leave_type} ({self.status})'

    @property
    def num_days(self):
        """Calendar days inclusive."""
        return (self.end_date - self.start_date).days + 1


class LeaveBalance(models.Model):
    employee   = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='leave_balances',
    )
    leave_type = models.CharField(
        max_length=20,
        choices=LeaveRequest.LeaveType.choices,
    )
    year       = models.PositiveSmallIntegerField()
    total_days = models.PositiveSmallIntegerField(default=0)
    used_days  = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'leave_balances'
        unique_together = [['employee', 'leave_type', 'year']]
        ordering = ['employee', 'leave_type']

    def __str__(self):
        return f'{self.employee.full_name} — {self.leave_type} {self.year}'

    @property
    def remaining_days(self):
        return max(self.total_days - self.used_days, 0)


# ── HR Documents ──────────────────────────────────────────────────────────────

def hr_document_path(instance, filename):
    return f'hr_documents/{instance.employee.employee_id}/{filename}'


class HRDocument(models.Model):
    class DocType(models.TextChoices):
        ID_PROOF    = 'id_proof',    'ID Proof'
        CONTRACT    = 'contract',    'Contract'
        CERTIFICATE = 'certificate', 'Certificate'
        OTHER       = 'other',       'Other'

    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending Review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    employee     = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='hr_documents',
    )
    doc_type     = models.CharField(max_length=20, choices=DocType.choices)
    title        = models.CharField(max_length=255)
    file         = models.FileField(upload_to=hr_document_path)
    file_size    = models.PositiveIntegerField(default=0)   # bytes
    status       = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    uploaded_by  = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='uploaded_hr_documents',
    )
    reviewed_by  = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_hr_documents',
    )
    review_notes = models.TextField(blank=True)
    reviewed_at  = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'hr_documents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.employee.full_name} — {self.doc_type}: {self.title}'


# ── Recruitment ───────────────────────────────────────────────────────────────

class RecruitmentPosition(models.Model):
    class PositionStatus(models.TextChoices):
        OPEN   = 'open',   'Open'
        CLOSED = 'closed', 'Closed'
        HOLD   = 'hold',   'On Hold'

    title       = models.CharField(max_length=255)
    department  = models.ForeignKey(
        'departments.Department',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='positions',
    )
    description = models.TextField(blank=True)
    status      = models.CharField(
        max_length=20,
        choices=PositionStatus.choices,
        default=PositionStatus.OPEN,
    )
    openings    = models.PositiveSmallIntegerField(default=1)
    created_by  = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_positions',
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'recruitment_positions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} ({self.status})'


class Applicant(models.Model):
    class ApplicantStatus(models.TextChoices):
        APPLIED   = 'applied',   'Applied'
        SCREENING = 'screening', 'Screening'
        INTERVIEW = 'interview', 'Interview'
        OFFERED   = 'offered',   'Offered'
        HIRED     = 'hired',     'Hired'
        REJECTED  = 'rejected',  'Rejected'

    position        = models.ForeignKey(
        RecruitmentPosition,
        on_delete=models.CASCADE,
        related_name='applicants',
    )
    full_name       = models.CharField(max_length=255)
    email           = models.EmailField()
    phone           = models.CharField(max_length=20, blank=True)
    resume          = models.FileField(upload_to='hr_resumes/', null=True, blank=True)
    status          = models.CharField(
        max_length=20,
        choices=ApplicantStatus.choices,
        default=ApplicantStatus.APPLIED,
    )
    interview_notes = models.TextField(blank=True)
    applied_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'applicants'
        ordering = ['-applied_at']

    def __str__(self):
        return f'{self.full_name} — {self.position.title} ({self.status})'


# ── Salary & Bank Details ──────────────────────────────────────────────────────

class EmployeeBankDetails(models.Model):
    """Bank account information for an employee. Sensitive fields masked in serializer."""

    class Status(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    employee             = models.OneToOneField(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='bank_details',
    )
    account_holder_name  = models.CharField(max_length=255)
    bank_name            = models.CharField(max_length=255)
    account_number       = models.CharField(max_length=30)   # stored plain; masked in serializer
    ifsc_code            = models.CharField(max_length=11)   # standard 11-char IFSC
    branch_name          = models.CharField(max_length=255, blank=True)
    upi_id               = models.CharField(max_length=100, blank=True)
    pan_number           = models.CharField(max_length=10, blank=True)  # 10-char Indian PAN
    passbook_photo       = models.ImageField(upload_to='bank_details/passbooks/', null=True, blank=True)

    # Approval workflow
    status               = models.CharField(max_length=20, choices=Status.choices, default=Status.APPROVED)
    reviewed_by          = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_bank_details',
    )
    reviewed_at          = models.DateTimeField(null=True, blank=True)
    review_note          = models.TextField(blank=True)

    created_at           = models.DateTimeField(auto_now_add=True)
    updated_at           = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employee_bank_details'

    def __str__(self):
        tail = self.account_number[-4:] if len(self.account_number) >= 4 else '****'
        return f'{self.employee.full_name} — {self.bank_name} (****{tail})'


class BankDetailsChangeLog(models.Model):
    """Audit trail for bank details changes."""

    bank_details = models.ForeignKey(
        EmployeeBankDetails, on_delete=models.CASCADE, related_name='change_logs',
    )
    changed_by   = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL, null=True,
    )
    field_name   = models.CharField(max_length=100)
    old_value    = models.TextField(blank=True)
    new_value    = models.TextField(blank=True)
    change_type  = models.CharField(max_length=20, default='updated')  # 'created' or 'updated'
    changed_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bank_details_change_log'
        ordering = ['-changed_at']

    def __str__(self):
        return f'{self.field_name}: {self.old_value} → {self.new_value}'


class SalaryStructure(models.Model):
    """Salary breakdown per employee. net_salary is auto-computed on save."""

    class SalaryCycle(models.TextChoices):
        MONTHLY   = 'monthly',   'Monthly'
        BIMONTHLY = 'bimonthly', 'Bi-Monthly'
        WEEKLY    = 'weekly',    'Weekly'

    employee       = models.OneToOneField(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='salary_structure',
    )
    base_salary    = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    hra            = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    allowances     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    bonus          = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    deductions     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax            = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_salary     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    salary_cycle   = models.CharField(
        max_length=20,
        choices=SalaryCycle.choices,
        default=SalaryCycle.MONTHLY,
    )
    effective_from = models.DateField(null=True, blank=True)
    created_by     = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_salary_structures',
    )
    updated_by     = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='updated_salary_structures',
    )
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'salary_structures'

    def save(self, *args, **kwargs):
        # Auto-compute net_salary every time the record is saved
        self.net_salary = (
            (self.base_salary or Decimal('0')) +
            (self.hra or Decimal('0')) +
            (self.allowances or Decimal('0')) +
            (self.bonus or Decimal('0')) -
            (self.deductions or Decimal('0')) -
            (self.tax or Decimal('0'))
        )
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.employee.full_name} — Net: {self.net_salary} ({self.salary_cycle})'


class SalaryPayment(models.Model):
    """Monthly salary disbursement record per employee."""

    class PaymentStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID    = 'paid',    'Paid'

    class PaymentMethod(models.TextChoices):
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        UPI           = 'upi',           'UPI'
        CASH          = 'cash',          'Cash'

    employee       = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='salary_payments',
    )
    month          = models.PositiveSmallIntegerField()  # 1–12
    year           = models.PositiveSmallIntegerField()
    amount_paid    = models.DecimalField(max_digits=12, decimal_places=2)
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
    )
    payment_date   = models.DateField(null=True, blank=True)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.BANK_TRANSFER,
    )
    processed_by   = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='processed_payments',
    )
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table        = 'salary_payments'
        unique_together = [['employee', 'month', 'year']]
        ordering        = ['-year', '-month', 'employee__full_name']

    def __str__(self):
        return f'{self.employee.full_name} — {self.month}/{self.year} ({self.payment_status})'


class Payslip(models.Model):
    """
    Snapshot of salary components at the time of payslip generation.
    PDF is generated on-the-fly via reportlab — no file stored.
    """

    employee     = models.ForeignKey(
        'employees.Employee',
        on_delete=models.CASCADE,
        related_name='payslips',
    )
    payment      = models.OneToOneField(
        SalaryPayment,
        on_delete=models.CASCADE,
        related_name='payslip',
    )
    # Frozen salary snapshot — independent of future SalaryStructure changes
    base_salary  = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    hra          = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    allowances   = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    bonus        = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    deductions   = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax          = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_salary   = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    generated_by = models.ForeignKey(
        'authentication.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='generated_payslips',
    )
    is_auto_generated = models.BooleanField(default=False)
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payslips'
        ordering = ['-generated_at']

    def __str__(self):
        return f'{self.employee.full_name} — {self.payment.month}/{self.payment.year}'


# ── Hiring / Recruitment (Full Module) ────────────────────────────────────────

class JobPosition(models.Model):
    class EmploymentType(models.TextChoices):
        FULL_TIME  = 'full_time',  'Full Time'
        PART_TIME  = 'part_time',  'Part Time'
        INTERNSHIP = 'internship', 'Internship'
        CONTRACT   = 'contract',   'Contract'

    class Status(models.TextChoices):
        OPEN   = 'open',   'Open'
        CLOSED = 'closed', 'Closed'
        PAUSED = 'paused', 'Paused'

    job_title           = models.CharField(max_length=200)
    department          = models.ForeignKey(
        'departments.Department', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='job_positions',
    )
    job_description     = models.TextField()
    required_skills     = models.TextField(blank=True)
    experience_required = models.CharField(max_length=100, blank=True)
    salary_range        = models.CharField(max_length=100, blank=True)
    job_location        = models.CharField(max_length=200, blank=True)
    employment_type     = models.CharField(
        max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME,
    )
    job_status          = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN,
    )
    created_by          = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_jobs',
    )
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'job_positions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.job_title} ({self.job_status})'


class Candidate(models.Model):
    class Stage(models.TextChoices):
        APPLIED        = 'applied',        'Applied'
        SCREENING      = 'screening',      'Screening'
        INTERVIEW      = 'interview',      'Interview'
        TECHNICAL_TEST = 'technical_test', 'Technical Test'
        FINAL_ROUND    = 'final_round',    'Final Round'
        OFFER_SENT     = 'offer_sent',     'Offer Sent'
        HIRED          = 'hired',          'Hired'
        REJECTED       = 'rejected',       'Rejected'

    candidate_name        = models.CharField(max_length=200)
    email                 = models.EmailField()
    phone                 = models.CharField(max_length=20, blank=True)
    resume_file           = models.FileField(upload_to='hiring/resumes/', null=True, blank=True)
    portfolio_link        = models.URLField(blank=True)
    linkedin_profile      = models.URLField(blank=True)
    applied_position      = models.ForeignKey(
        JobPosition, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='candidates',
    )
    application_date      = models.DateField(auto_now_add=True)
    current_stage         = models.CharField(
        max_length=30, choices=Stage.choices, default=Stage.APPLIED,
    )
    rating                = models.PositiveSmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    notes                 = models.TextField(blank=True)
    added_by              = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='added_candidates',
    )
    converted_to_employee = models.BooleanField(default=False)
    created_at            = models.DateTimeField(auto_now_add=True)
    updated_at            = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'candidates'
        ordering = ['-created_at']
        unique_together = [('email', 'applied_position')]

    def __str__(self):
        return f'{self.candidate_name} ({self.current_stage})'


class Interview(models.Model):
    class InterviewType(models.TextChoices):
        ONLINE    = 'online',    'Online'
        IN_PERSON = 'in_person', 'In Person'

    candidate      = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name='interviews',
    )
    interviewer    = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='conducted_interviews',
    )
    interview_date = models.DateField()
    interview_time = models.TimeField()
    meeting_link   = models.URLField(blank=True)
    interview_type = models.CharField(
        max_length=20, choices=InterviewType.choices, default=InterviewType.ONLINE,
    )
    notes          = models.TextField(blank=True)
    scheduled_by   = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='scheduled_interviews',
    )
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'interviews'
        ordering = ['interview_date', 'interview_time']

    def __str__(self):
        return f'{self.candidate.candidate_name} — {self.interview_date}'


class CandidateEvaluation(models.Model):
    candidate             = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name='evaluations',
    )
    interviewer           = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='evaluations_given',
    )
    _score_validators = [MinValueValidator(1), MaxValueValidator(10)]
    technical_skill_score = models.PositiveSmallIntegerField(null=True, blank=True, validators=_score_validators)
    communication_score   = models.PositiveSmallIntegerField(null=True, blank=True, validators=_score_validators)
    problem_solving_score = models.PositiveSmallIntegerField(null=True, blank=True, validators=_score_validators)
    culture_fit_score     = models.PositiveSmallIntegerField(null=True, blank=True, validators=_score_validators)
    overall_rating        = models.PositiveSmallIntegerField(null=True, blank=True, validators=_score_validators)
    comments              = models.TextField(blank=True)
    created_at            = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'candidate_evaluations'
        ordering = ['-created_at']

    def __str__(self):
        return f'Eval: {self.candidate.candidate_name} by {self.interviewer}'


class CandidateDocument(models.Model):
    class DocType(models.TextChoices):
        RESUME          = 'resume',          'Resume'
        PORTFOLIO       = 'portfolio',       'Portfolio'
        COVER_LETTER    = 'cover_letter',    'Cover Letter'
        INTERVIEW_NOTES = 'interview_notes', 'Interview Notes'
        OTHER           = 'other',           'Other'

    candidate   = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name='documents',
    )
    doc_type    = models.CharField(max_length=30, choices=DocType.choices, default=DocType.OTHER)
    title       = models.CharField(max_length=200)
    file        = models.FileField(upload_to='hiring/documents/')
    uploaded_by = models.ForeignKey(
        'authentication.User', on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'candidate_documents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.candidate.candidate_name} — {self.doc_type}: {self.title}'
