"""
HR module serializers.
"""

from rest_framework import serializers
from .models import (
    LeaveRequest, LeaveBalance, HRDocument, RecruitmentPosition, Applicant,
    EmployeeBankDetails, BankDetailsChangeLog, SalaryStructure, SalaryPayment, Payslip,
    JobPosition, Candidate, Interview, CandidateEvaluation, CandidateDocument,
)


# ── Minimal Employee nested serializer ────────────────────────────────────────

class EmployeeMinimalSerializer(serializers.Serializer):
    id          = serializers.IntegerField()
    employee_id = serializers.CharField()
    full_name   = serializers.CharField()
    department  = serializers.SerializerMethodField()

    def get_department(self, obj):
        return obj.department.name if obj.department else None


# ── Leave ─────────────────────────────────────────────────────────────────────

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name  = serializers.CharField(source='employee.full_name',    read_only=True)
    employee_code  = serializers.CharField(source='employee.employee_id',  read_only=True)
    department     = serializers.SerializerMethodField()
    num_days       = serializers.ReadOnlyField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = LeaveRequest
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'leave_type', 'start_date', 'end_date', 'reason',
            'status', 'num_days',
            'reviewed_by', 'reviewed_by_name', 'review_comment', 'reviewed_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'employee',
            'status', 'reviewed_by', 'review_comment', 'reviewed_at',
            'created_at', 'updated_at',
        ]

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.full_name if obj.reviewed_by else None


class LeaveBalanceSerializer(serializers.ModelSerializer):
    remaining_days = serializers.ReadOnlyField()
    employee_name  = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code  = serializers.CharField(source='employee.employee_id', read_only=True)

    class Meta:
        model  = LeaveBalance
        fields = [
            'id', 'employee', 'employee_name', 'employee_code',
            'leave_type', 'year', 'total_days', 'used_days', 'remaining_days',
        ]
        read_only_fields = ['used_days']


# ── HR Documents ──────────────────────────────────────────────────────────────

class HRDocumentSerializer(serializers.ModelSerializer):
    employee_name    = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code    = serializers.CharField(source='employee.employee_id', read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    file_url         = serializers.SerializerMethodField()

    class Meta:
        model  = HRDocument
        fields = [
            'id', 'employee', 'employee_name', 'employee_code',
            'doc_type', 'title', 'file', 'file_url', 'file_size', 'status',
            'uploaded_by', 'uploaded_by_name',
            'reviewed_by', 'reviewed_by_name', 'review_notes', 'reviewed_at',
            'created_at',
        ]
        read_only_fields = [
            'status', 'reviewed_by', 'review_notes', 'reviewed_at',
            'uploaded_by', 'file_size', 'created_at',
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.full_name if obj.uploaded_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.full_name if obj.reviewed_by else None

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None


# ── Recruitment ───────────────────────────────────────────────────────────────

class ApplicantSerializer(serializers.ModelSerializer):
    position_title = serializers.CharField(source='position.title', read_only=True)
    resume_url     = serializers.SerializerMethodField()

    class Meta:
        model  = Applicant
        fields = [
            'id', 'position', 'position_title',
            'full_name', 'email', 'phone',
            'resume', 'resume_url',
            'status', 'interview_notes',
            'applied_at', 'updated_at',
        ]
        read_only_fields = ['applied_at', 'updated_at']

    def get_resume_url(self, obj):
        request = self.context.get('request')
        if obj.resume and request:
            return request.build_absolute_uri(obj.resume.url)
        return obj.resume.url if obj.resume else None


class RecruitmentPositionSerializer(serializers.ModelSerializer):
    department_name = serializers.SerializerMethodField()
    applicant_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = RecruitmentPosition
        fields = [
            'id', 'title', 'department', 'department_name',
            'description', 'status', 'openings',
            'created_by', 'created_by_name',
            'applicant_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None

    def get_applicant_count(self, obj):
        return obj.applicants.count()

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None


# ── Bank Details ──────────────────────────────────────────────────────────────

class EmployeeBankDetailsSerializer(serializers.ModelSerializer):
    employee_name          = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code          = serializers.CharField(source='employee.employee_id', read_only=True)
    department             = serializers.SerializerMethodField()
    account_number_display = serializers.SerializerMethodField()
    pan_number_display     = serializers.SerializerMethodField()
    reviewed_by_name       = serializers.SerializerMethodField()

    class Meta:
        model  = EmployeeBankDetails
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'account_holder_name', 'bank_name',
            'account_number',          # write-only — accepted in POST/PATCH
            'account_number_display',  # read path — masked or full depending on role
            'ifsc_code', 'branch_name', 'upi_id',
            'pan_number',              # write-only
            'pan_number_display',      # read path — masked or full
            'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'review_note',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'employee':       {'required': False},  # auto-assigned for non-HR users in perform_create
            'account_number': {'write_only': True},
            'pan_number':     {'write_only': True, 'required': False, 'allow_blank': True},
            'status':         {'read_only': True},
            'reviewed_by':    {'read_only': True},
            'reviewed_at':    {'read_only': True},
            'review_note':    {'read_only': True},
        }

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.full_name if obj.reviewed_by else None

    def get_account_number_display(self, obj):
        """HR+ sees full account number; everyone else sees last 4 digits masked."""
        request = self.context.get('request')
        if request and request.user.is_hr_or_above:
            return obj.account_number
        n = obj.account_number
        return f'****{n[-4:]}' if len(n) >= 4 else '****'

    def get_pan_number_display(self, obj):
        """HR+ sees full PAN; others see *****XXXXF style."""
        if not obj.pan_number:
            return None
        request = self.context.get('request')
        if request and request.user.is_hr_or_above:
            return obj.pan_number
        p = obj.pan_number
        return f'*****{p[5:9]}X' if len(p) >= 10 else '*****'


class BankDetailsChangeLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True)

    class Meta:
        model  = BankDetailsChangeLog
        fields = ['id', 'changed_by', 'changed_by_name', 'field_name',
                  'old_value', 'new_value', 'change_type', 'changed_at']


# ── Salary Structure ──────────────────────────────────────────────────────────

class SalaryStructureSerializer(serializers.ModelSerializer):
    employee_name   = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code   = serializers.CharField(source='employee.employee_id', read_only=True)
    department      = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = SalaryStructure
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'base_salary', 'hra', 'allowances', 'bonus', 'deductions', 'tax',
            'net_salary',       # read-only — auto-computed by model.save()
            'salary_cycle', 'effective_from',
            'created_by', 'created_by_name',
            'updated_by', 'updated_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'net_salary', 'created_by', 'updated_by', 'created_at', 'updated_at',
        ]

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.full_name if obj.updated_by else None


# ── Salary Payment ────────────────────────────────────────────────────────────

class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name     = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code     = serializers.CharField(source='employee.employee_id', read_only=True)
    department        = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()
    has_payslip       = serializers.SerializerMethodField()

    class Meta:
        model  = SalaryPayment
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'month', 'year', 'amount_paid',
            'payment_status', 'payment_date', 'payment_method',
            'processed_by', 'processed_by_name',
            'has_payslip', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['processed_by', 'created_at', 'updated_at']

    def validate_month(self, value):
        if not (1 <= value <= 12):
            raise serializers.ValidationError('Month must be between 1 and 12.')
        return value

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_processed_by_name(self, obj):
        return obj.processed_by.full_name if obj.processed_by else None

    def get_has_payslip(self, obj):
        return hasattr(obj, 'payslip')


# ── Payslip ───────────────────────────────────────────────────────────────────

class PayslipSerializer(serializers.ModelSerializer):
    employee_name     = serializers.CharField(source='employee.full_name',   read_only=True)
    employee_code     = serializers.CharField(source='employee.employee_id', read_only=True)
    department        = serializers.SerializerMethodField()
    payment_month     = serializers.IntegerField(source='payment.month',          read_only=True)
    payment_year      = serializers.IntegerField(source='payment.year',           read_only=True)
    payment_status    = serializers.CharField(source='payment.payment_status',    read_only=True)
    payment_method    = serializers.CharField(source='payment.payment_method',    read_only=True)
    payment_date      = serializers.DateField(source='payment.payment_date',      read_only=True)
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = Payslip
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'department',
            'payment', 'payment_month', 'payment_year',
            'payment_status', 'payment_method', 'payment_date',
            'base_salary', 'hra', 'allowances', 'bonus',
            'deductions', 'tax', 'net_salary',
            'generated_by', 'generated_by_name', 'generated_at',
        ]
        read_only_fields = ['generated_by', 'generated_at']

    def get_department(self, obj):
        return obj.employee.department.name if obj.employee.department else None

    def get_generated_by_name(self, obj):
        return obj.generated_by.full_name if obj.generated_by else None


# ── Hiring Module Serializers ──────────────────────────────────────────────────

class JobPositionSerializer(serializers.ModelSerializer):
    department_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    candidate_count = serializers.SerializerMethodField()

    class Meta:
        model  = JobPosition
        fields = [
            'id', 'job_title', 'department', 'department_name',
            'job_description', 'required_skills', 'experience_required',
            'salary_range', 'job_location', 'employment_type', 'job_status',
            'created_by', 'created_by_name', 'candidate_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    def get_candidate_count(self, obj):
        return obj.candidates.count()


class CandidateDocumentSerializer(serializers.ModelSerializer):
    file_url        = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = CandidateDocument
        fields = ['id', 'candidate', 'doc_type', 'title', 'file', 'file_url',
                  'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['uploaded_by', 'created_at']

    def get_file_url(self, obj):
        req = self.context.get('request')
        return req.build_absolute_uri(obj.file.url) if req and obj.file else None

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.full_name if obj.uploaded_by else None


class CandidateEvaluationSerializer(serializers.ModelSerializer):
    interviewer_name = serializers.SerializerMethodField()

    class Meta:
        model  = CandidateEvaluation
        fields = [
            'id', 'candidate', 'interviewer', 'interviewer_name',
            'technical_skill_score', 'communication_score',
            'problem_solving_score', 'culture_fit_score',
            'overall_rating', 'comments', 'created_at',
        ]
        read_only_fields = ['interviewer', 'created_at']

    def get_interviewer_name(self, obj):
        return obj.interviewer.full_name if obj.interviewer else None


class InterviewSerializer(serializers.ModelSerializer):
    interviewer_name = serializers.SerializerMethodField()
    candidate_name   = serializers.SerializerMethodField()
    scheduled_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = Interview
        fields = [
            'id', 'candidate', 'candidate_name', 'interviewer', 'interviewer_name',
            'interview_date', 'interview_time', 'meeting_link', 'interview_type',
            'notes', 'scheduled_by', 'scheduled_by_name', 'created_at',
        ]
        read_only_fields = ['scheduled_by', 'created_at']

    def get_interviewer_name(self, obj):
        return obj.interviewer.full_name if obj.interviewer else None

    def get_candidate_name(self, obj):
        return obj.candidate.candidate_name

    def get_scheduled_by_name(self, obj):
        return obj.scheduled_by.full_name if obj.scheduled_by else None


class CandidateListSerializer(serializers.ModelSerializer):
    position_title   = serializers.SerializerMethodField()
    resume_url       = serializers.SerializerMethodField()
    evaluation_count = serializers.SerializerMethodField()

    class Meta:
        model  = Candidate
        fields = [
            'id', 'candidate_name', 'email', 'phone',
            'applied_position', 'position_title',
            'application_date', 'current_stage', 'rating',
            'resume_url', 'converted_to_employee', 'evaluation_count',
            'created_at',
        ]
        read_only_fields = ['application_date', 'created_at', 'converted_to_employee']

    def get_position_title(self, obj):
        return obj.applied_position.job_title if obj.applied_position else None

    def get_resume_url(self, obj):
        if obj.resume_file:
            req = self.context.get('request')
            return req.build_absolute_uri(obj.resume_file.url) if req else obj.resume_file.url
        return None

    def get_evaluation_count(self, obj):
        return obj.evaluations.count()


class CandidateDetailSerializer(CandidateListSerializer):
    interviews  = serializers.SerializerMethodField()
    evaluations = serializers.SerializerMethodField()
    documents   = serializers.SerializerMethodField()

    class Meta(CandidateListSerializer.Meta):
        fields = CandidateListSerializer.Meta.fields + [
            'portfolio_link', 'linkedin_profile', 'notes',
            'interviews', 'evaluations', 'documents',
        ]

    def get_interviews(self, obj):
        return InterviewSerializer(
            obj.interviews.all(), many=True, context=self.context
        ).data

    def get_evaluations(self, obj):
        return CandidateEvaluationSerializer(
            obj.evaluations.all(), many=True, context=self.context
        ).data

    def get_documents(self, obj):
        return CandidateDocumentSerializer(
            obj.documents.all(), many=True, context=self.context
        ).data
