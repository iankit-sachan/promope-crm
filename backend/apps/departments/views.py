from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Department
from .serializers import DepartmentSerializer, DepartmentDetailSerializer
from apps.authentication.permissions import IsManagerOrAbove, IsAdminOrAbove, IsHROrAbove
from apps.activity.utils import log_activity


class DepartmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/departments/   - List all departments
    POST /api/departments/   - Create department (admin+)
    """
    queryset = Department.objects.all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return DepartmentSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsHROrAbove()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        dept = serializer.save()
        log_activity(
            actor=self.request.user,
            verb='employee_added',
            description=f'{self.request.user.full_name} created department "{dept.name}"',
        )


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/departments/{id}/   - Department detail with employees and tasks
    PUT    /api/departments/{id}/   - Update
    DELETE /api/departments/{id}/   - Delete (admin+)
    """
    queryset = Department.objects.prefetch_related('employees', 'tasks')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return DepartmentDetailSerializer
        return DepartmentSerializer

    def get_permissions(self):
        if self.request.method in ['PUT', 'PATCH', 'DELETE']:
            return [IsAuthenticated(), IsHROrAbove()]
        return [IsAuthenticated()]
